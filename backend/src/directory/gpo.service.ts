import type ldap from "ldapjs";
import type { GpoLink, GpoObject, DomainInfo, GpoOuTreeNode } from "@samba-admin/shared";
import { search, attrString } from "./ldapClient.js";

const LINK_RE = /\[LDAP:\/\/([^;]+);(\d+)\]/g;

/**
 * Reads the read-only GPO links for an OU directly from its `gPLink`
 * attribute (a standard LDAP attribute — no need to shell out to
 * `samba-tool gpo` for this) and resolves each linked GPO's display name
 * from the Policies container.
 */
export async function getGpoLinks(client: ldap.Client, ouDn: string): Promise<GpoLink[]> {
  const entries = await search(client, ouDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPLink"] });
  const gpLink = attrString(entries[0]?.attributes ?? {}, "gPLink");
  if (!gpLink) return [];

  const links: GpoLink[] = [];
  let match: RegExpExecArray | null;
  let order = 0;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(gpLink)) !== null) {
    const [, gpoDn, flagsRaw] = match;
    const flags = Number(flagsRaw);
    const guidMatch = /CN=\{([0-9A-Fa-f-]+)\}/.exec(gpoDn);
    const gpoGuid = guidMatch ? guidMatch[1] : gpoDn;

    let displayName = gpoGuid;
    try {
      const gpoEntries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["displayName"] });
      displayName = attrString(gpoEntries[0]?.attributes ?? {}, "displayName") ?? displayName;
    } catch {
      // GPO object may have been removed while the link is stale; show the GUID as a fallback.
    }

    links.push({ gpoGuid, displayName, enforced: (flags & 2) !== 0, disabled: (flags & 1) !== 0, order: order++ });
  }
  return links;
}

/**
 * Lists all Group Policy Objects (GPOs) in the domain.
 * GPOs are stored under CN=Policies,CN=System,<domainDN>.
 */
export async function listGpos(client: ldap.Client, baseDn: string): Promise<GpoObject[]> {
  // Find the domain DN from the base DN
  const domainMatch = /DC=([^,]+)/.exec(baseDn);
  if (!domainMatch) return [];

  const policiesDn = `CN=Policies,CN=System,${baseDn}`;
  const entries = await search(client, policiesDn, {
    scope: "one",
    filter: "(objectClass=groupPolicyContainer)",
    attributes: ["cn", "displayName", "description", "flags", "gPCFileSysPath", "whenCreated", "whenChanged"],
  });

  return entries.map((entry) => ({
    dn: entry.dn,
    guid: entry.dn.replace(/^CN=\{/, "").replace(/\},.*$/, ""),
    displayName: attrString(entry.attributes, "displayName") ?? attrString(entry.attributes, "cn") ?? "",
    description: attrString(entry.attributes, "description"),
    flags: entry.attributes.flags ? Number(attrString(entry.attributes, "flags")) : undefined,
    gpcFileSysPath: attrString(entry.attributes, "gPCFileSysPath"),
    createdTime: attrString(entry.attributes, "whenCreated"),
    modifiedTime: attrString(entry.attributes, "whenChanged"),
  }));
}

/**
 * Gets domain information from the root DSE.
 */
export async function getDomainInfo(client: ldap.Client, baseDn: string): Promise<DomainInfo> {
  const entries = await search(client, baseDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["dc", "dnsHostName", "nETBIOSName"],
  });

  const entry = entries[0];
  if (!entry) {
    return { dn: baseDn, name: "", dnsName: "", netbiosName: "" };
  }

  const dc = attrString(entry.attributes, "dc") ?? "";
  return {
    dn: baseDn,
    name: dc,
    dnsName: dc,
    netbiosName: attrString(entry.attributes, "nETBIOSName") ?? dc.toUpperCase().split(".")[0],
  };
}

/**
 * Gets OUs under a given parent DN for GPO linking, recursing to full depth
 * — a GPO can be linked to an OU at any nesting level, not just the top two
 * (confirmed live: a link on a third-level OU was silently invisible in the
 * tree before this was made properly recursive).
 */
export async function getOuTree(client: ldap.Client, baseDn: string): Promise<GpoOuTreeNode[]> {
  const entries = await search(client, baseDn, {
    scope: "one",
    filter: "(objectClass=organizationalUnit)",
    attributes: ["ou", "dn"],
  });

  return Promise.all(
    entries.map(async (entry) => {
      const name = attrString(entry.attributes, "ou") ?? entry.dn.split(",")[0].replace(/^OU=/, "");
      let childOus: GpoOuTreeNode[] = [];
      try {
        childOus = await getOuTree(client, entry.dn);
      } catch {
        // Ignore errors — an OU whose children can't be listed just shows as a leaf.
      }
      return { dn: entry.dn, name, childOus };
    })
  );
}
