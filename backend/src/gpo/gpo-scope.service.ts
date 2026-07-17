import type ldap from "ldapjs";
import type { GpoScopeLink } from "@samba-admin/shared";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

const LINK_RE = /\[LDAP:\/\/([^;]+);(\d+)\]/g;

function guidOfDn(dn: string): string {
  const m = /CN=\{([0-9A-Fa-f-]+)\}/i.exec(dn);
  return m ? m[1].toLowerCase() : dn.toLowerCase();
}

function parseGpLinkEntries(gpLink: string): { gpoDn: string; flags: number }[] {
  const entries: { gpoDn: string; flags: number }[] = [];
  const re = new RegExp(LINK_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(gpLink)) !== null) {
    entries.push({ gpoDn: match[1], flags: Number(match[2]) });
  }
  return entries;
}

function serializeGpLinkEntries(entries: { gpoDn: string; flags: number }[]): string {
  return entries.map((e) => `[LDAP://${e.gpoDn};${e.flags}]`).join("");
}

function targetName(dn: string, attrs: Record<string, unknown>, isDomain: boolean): string {
  if (isDomain) return attrString(attrs, "dc") ?? dn;
  return attrString(attrs, "ou") ?? dn.split(",")[0].replace(/^OU=/, "");
}

/**
 * Reverse of getGpoLinks (directory/gpo.service.ts): finds every container
 * (domain root or OU) that links this specific GPO, not the other way
 * around. AD keeps no backlink attribute for GPO links, so this is a
 * sub-scope search across the whole domain filtering on gPLink containing
 * this GPO's DN — "sub" scope includes the base object itself, so a single
 * search from the domain root also covers the domain-root link case. Site
 * links are out of scope (no site management UI exists elsewhere in this app).
 */
export async function getGpoScopeLinks(client: ldap.Client, domainDn: string, gpoGuid: string): Promise<GpoScopeLink[]> {
  const entries = await search(client, domainDn, {
    scope: "sub",
    filter: `(gPLink=*{${gpoGuid}}*)`,
    attributes: ["gPLink", "objectClass", "ou", "dc"],
  });

  const links: GpoScopeLink[] = [];
  let order = 0;
  for (const entry of entries) {
    const gpLink = attrString(entry.attributes, "gPLink");
    if (!gpLink) continue;
    const objectClasses = (Array.isArray(entry.attributes.objectClass) ? entry.attributes.objectClass : [entry.attributes.objectClass]) as string[];
    const isDomain = objectClasses?.includes("domainDNS") ?? entry.dn === domainDn;

    const linkEntry = parseGpLinkEntries(gpLink).find((e) => guidOfDn(e.gpoDn) === gpoGuid.toLowerCase());
    if (!linkEntry) continue;

    links.push({
      targetDn: entry.dn,
      targetName: targetName(entry.dn, entry.attributes, isDomain),
      targetType: isDomain ? "domain" : "ou",
      enforced: (linkEntry.flags & 2) !== 0,
      linkEnabled: (linkEntry.flags & 1) === 0,
      order: order++,
    });
  }
  return links;
}

async function readGpLink(client: ldap.Client, targetDn: string): Promise<{ gpoDn: string; flags: number }[]> {
  const entries = await search(client, targetDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPLink"] });
  const gpLink = attrString(entries[0]?.attributes ?? {}, "gPLink") ?? "";
  return parseGpLinkEntries(gpLink);
}

async function writeGpLink(client: ldap.Client, targetDn: string, entries: { gpoDn: string; flags: number }[]): Promise<void> {
  // AD/ldb rejects writing gPLink as an empty string ("Element gPLink has
  // empty attribute") — the last link must be removed via a delete
  // operation with no values, not a replace with "".
  if (entries.length === 0) {
    await modify(client, targetDn, [buildChange("delete", "gPLink", [])]);
    return;
  }
  await modify(client, targetDn, [buildChange("replace", "gPLink", serializeGpLinkEntries(entries))]);
}

export async function createGpoLink(client: ldap.Client, domainDn: string, gpoGuid: string, targetDn: string): Promise<void> {
  const gpoDn = `CN={${gpoGuid}},CN=Policies,CN=System,${domainDn}`;
  const entries = await readGpLink(client, targetDn);
  if (entries.some((e) => guidOfDn(e.gpoDn) === gpoGuid.toLowerCase())) return; // already linked
  entries.push({ gpoDn, flags: 0 });
  await writeGpLink(client, targetDn, entries);
}

export async function updateGpoLink(
  client: ldap.Client,
  gpoGuid: string,
  targetDn: string,
  options: { enforced?: boolean; linkEnabled?: boolean }
): Promise<void> {
  const entries = await readGpLink(client, targetDn);
  const idx = entries.findIndex((e) => guidOfDn(e.gpoDn) === gpoGuid.toLowerCase());
  if (idx === -1) throw new Error("Verknüpfung nicht gefunden.");

  const current = entries[idx];
  const wasEnforced = (current.flags & 2) !== 0;
  const wasEnabled = (current.flags & 1) === 0;
  const enforced = options.enforced ?? wasEnforced;
  const linkEnabled = options.linkEnabled ?? wasEnabled;
  entries[idx] = { ...current, flags: (enforced ? 2 : 0) | (linkEnabled ? 0 : 1) };
  await writeGpLink(client, targetDn, entries);
}

export async function deleteGpoLink(client: ldap.Client, gpoGuid: string, targetDn: string): Promise<void> {
  const entries = await readGpLink(client, targetDn);
  const filtered = entries.filter((e) => guidOfDn(e.gpoDn) !== gpoGuid.toLowerCase());
  await writeGpLink(client, targetDn, filtered);
}
