import type ldap from "ldapjs";
import type { RsopGpoEntry, RsopResult } from "@samba-admin/shared";
import { search, attrString } from "../directory/ldapClient.js";
import { sidBufferToString } from "../directory/ldapUtil.js";
import { trusteeToLiteralSid } from "../directory/wellKnownSids.js";
import { getGpoLinks } from "../directory/gpo.service.js";
import { listWmiFilters } from "./gpo-details.service.js";
import { getGpoSddl, parseSddl, gpoDnOf, rightsSet, APPLY_GROUP_POLICY_RIGHT_GUID } from "./gpo-dacl.js";

/** gPOptions bit 0 ("Block Inheritance" in the GPMC UI). */
async function isBlockInheritance(client: ldap.Client, dn: string): Promise<boolean> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPOptions"] });
  const opts = Number(attrString(entries[0]?.attributes ?? {}, "gPOptions") ?? "0");
  return (opts & 1) !== 0;
}

/**
 * All SIDs the target's logon session would carry — the same set Windows itself uses to evaluate
 * Security Filtering. `tokenGroups` only reflects real, stored AD group memberships; "Authenticated
 * Users" (S-1-5-11) and "Everyone" (S-1-1-0) are logon-session pseudo-groups Windows adds
 * dynamically at authentication time and are never stored as a membership anywhere in AD, so every
 * real security principal implicitly carries both regardless of what tokenGroups reports.
 */
async function getTokenGroupSids(client: ldap.Client, dn: string): Promise<Set<string>> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=*)", attributes: ["objectSid", "tokenGroups"] });
  const attrs = entries[0]?.attributes ?? {};
  const sids = new Set<string>(["S-1-5-11", "S-1-1-0"]);
  const own = attrs.objectSid;
  if (own instanceof Buffer) sids.add(sidBufferToString(own));
  const raw = attrs.tokenGroups;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const v of list) {
    if (v instanceof Buffer) sids.add(sidBufferToString(v));
  }
  return sids;
}

function labelForContainer(dn: string, domainDn: string): string {
  if (dn.toUpperCase() === domainDn.toUpperCase()) return "Domäne";
  const rdn = dn.split(",")[0];
  return rdn.slice(rdn.indexOf("=") + 1);
}

/** domain-first, ..., immediate-parent-last chain of ancestor container DNs for `targetDn`. */
function buildAncestorChain(targetDn: string, domainDn: string): string[] {
  const chain: string[] = [];
  let rest = targetDn.slice(targetDn.indexOf(",") + 1);
  while (rest && rest.toUpperCase() !== domainDn.toUpperCase()) {
    chain.push(rest);
    rest = rest.slice(rest.indexOf(",") + 1);
  }
  chain.push(domainDn);
  return chain.reverse();
}

async function hasApplyGroupPolicy(gpoDn: string, targetSids: Set<string>): Promise<boolean> {
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);
  return parsed.dacl.some(
    (ace) =>
      ace.type === "OA" &&
      rightsSet(ace.rights).has("CR") &&
      (ace.objectGuid ?? "").toLowerCase() === APPLY_GROUP_POLICY_RIGHT_GUID &&
      targetSids.has(trusteeToLiteralSid(ace.trustee))
  );
}

/**
 * Simulates "Gruppenrichtlinienmodellierung" purely from AD data: walks the OU chain applying
 * real GPMC precedence rules (Block Inheritance, Enforced-links-always-win-with-root-enforced-
 * winning-among-enforced), then checks Security Filtering via the target's full transitive SID set.
 * WMI filters are shown for reference only — evaluating the actual WQL query needs the real target
 * machine's live WMI data, which this Linux-based backend has no way to query.
 */
export async function modelGpoResults(
  client: ldap.Client,
  domainDn: string,
  targetDn: string,
  targetType: "user" | "computer"
): Promise<RsopResult> {
  const chain = buildAncestorChain(targetDn, domainDn);

  const perLevel = await Promise.all(
    chain.map(async (dn) => ({
      dn,
      links: (await getGpoLinks(client, dn).catch(() => [])).filter((l) => !l.disabled),
      blocked: await isBlockInheritance(client, dn).catch(() => false),
    }))
  );

  let cutoffIndex = -1;
  perLevel.forEach((lvl, i) => {
    if (lvl.blocked) cutoffIndex = i;
  });

  const enforced: { link: (typeof perLevel)[number]["links"][number]; sourceDn: string }[] = [];
  const normal: { link: (typeof perLevel)[number]["links"][number]; sourceDn: string }[] = [];
  perLevel.forEach((lvl, i) => {
    for (const link of lvl.links) {
      if (link.enforced) enforced.push({ link, sourceDn: lvl.dn });
      else if (i >= cutoffIndex) normal.push({ link, sourceDn: lvl.dn });
    }
  });
  enforced.reverse(); // root-level enforced wins among enforced links -> place it last.

  const ordered = [...normal, ...enforced];
  const targetSids = await getTokenGroupSids(client, targetDn);
  const wmiFilters = await listWmiFilters(client, domainDn).catch(() => []);

  const seen = new Set<string>();
  const gpos: RsopGpoEntry[] = [];
  for (const { link, sourceDn } of ordered) {
    if (seen.has(link.gpoGuid)) continue;
    seen.add(link.gpoGuid);

    const gpoDn = gpoDnOf(domainDn, link.gpoGuid);
    const securityFilterPass = await hasApplyGroupPolicy(gpoDn, targetSids).catch(() => false);

    let wmiFilterName: string | undefined;
    try {
      const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCWQLFilter"] });
      const raw = attrString(entries[0]?.attributes ?? {}, "gPCWQLFilter");
      const guidMatch = raw ? /\{([0-9A-Fa-f-]+)\}/.exec(raw) : null;
      if (guidMatch) wmiFilterName = wmiFilters.find((f) => f.dn.toLowerCase().includes(guidMatch[1].toLowerCase()))?.name;
    } catch {
      // No WMI filter container on this domain; leave unassigned.
    }

    gpos.push({
      guid: link.gpoGuid,
      displayName: link.displayName,
      sourceDn,
      sourceLabel: labelForContainer(sourceDn, domainDn),
      enforced: link.enforced,
      securityFilterPass,
      wmiFilterName,
      willApply: securityFilterPass,
    });
  }

  return { targetDn, targetType, gpos };
}
