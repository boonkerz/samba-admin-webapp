import type ldap from "ldapjs";
import type { DirectoryObjectSummary, DirectoryObjectType } from "@samba-admin/shared";
import { search, attrString, attrBuffer, modifyDn } from "./ldapClient.js";
import { isAccountEnabled, sidBufferToString, escapeLdapFilter } from "./ldapUtil.js";

function classifyObject(objectClasses: string[]): DirectoryObjectType | undefined {
  if (objectClasses.includes("computer")) return "computer";
  if (objectClasses.includes("group")) return "group";
  if (objectClasses.includes("user")) return "user";
  if (objectClasses.includes("organizationalUnit")) return "ou";
  if (objectClasses.includes("container") || objectClasses.includes("builtinDomain")) return "container";
  return undefined;
}

export async function listObjects(
  client: ldap.Client,
  parentDn: string,
  typeFilter?: DirectoryObjectType
): Promise<DirectoryObjectSummary[]> {
  const entries = await search(client, parentDn, {
    scope: "one",
    filter: "(objectClass=*)",
    attributes: ["objectClass", "name", "cn", "ou", "description", "userAccountControl"],
  });

  const summaries: DirectoryObjectSummary[] = [];
  for (const entry of entries) {
    const objectClasses = (Array.isArray(entry.attributes.objectClass) ? entry.attributes.objectClass : [entry.attributes.objectClass]) as string[];
    const type = classifyObject(objectClasses);
    if (!type) continue;
    if (typeFilter && type !== typeFilter) continue;

    const name = attrString(entry.attributes, "cn") ?? attrString(entry.attributes, "ou") ?? attrString(entry.attributes, "name") ?? entry.dn;
    const uacRaw = attrString(entry.attributes, "userAccountControl");
    summaries.push({
      dn: entry.dn,
      name,
      type,
      description: attrString(entry.attributes, "description"),
      enabled: uacRaw ? isAccountEnabled(Number(uacRaw)) : undefined,
    });
  }
  return summaries;
}

export async function getObject(client: ldap.Client, dn: string): Promise<Record<string, unknown> | undefined> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=*)", attributes: ["*"] });
  const entry = entries[0];
  if (!entry) return undefined;
  const result: Record<string, unknown> = { dn: entry.dn };
  for (const [key, value] of Object.entries(entry.attributes)) {
    result[key] = Buffer.isBuffer(value) ? value.toString("base64") : value;
  }
  return result;
}

function rdnOf(dn: string): string {
  const firstComma = dn.indexOf(",");
  return firstComma === -1 ? dn : dn.slice(0, firstComma);
}

/** Generic move used for users/groups/OUs/computers alike (LDAP modDN with newSuperior). */
export async function moveObject(client: ldap.Client, dn: string, newParentDn: string): Promise<string> {
  const rdn = rdnOf(dn);
  await modifyDn(client, dn, rdn, newParentDn);
  return `${rdn},${newParentDn}`;
}

export async function searchObjects(
  client: ldap.Client,
  baseDn: string,
  query: string,
  typeFilter?: DirectoryObjectType
): Promise<DirectoryObjectSummary[]> {
  // An empty Name field means "show everything" (matching ADUC's own picker
  // behavior) rather than a substring filter — `cn=**` (empty query wrapped
  // in wildcards) matches nothing, it isn't a wildcard-that-matches-all.
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[\\*()\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  const nameFilter = trimmed ? `(|(cn=*${escaped}*)(sAMAccountName=*${escaped}*)(displayName=*${escaped}*))` : "";
  const entries = await search(client, baseDn, {
    scope: "sub",
    filter: `(&(objectClass=*)${nameFilter})`,
    attributes: ["objectClass", "name", "cn", "ou", "description", "userAccountControl", "objectSid"],
    sizeLimit: 100,
  });

  const summaries: DirectoryObjectSummary[] = [];
  for (const entry of entries) {
    const objectClasses = (Array.isArray(entry.attributes.objectClass) ? entry.attributes.objectClass : [entry.attributes.objectClass]) as string[];
    const type = classifyObject(objectClasses);
    if (!type || type === "container") continue;
    if (typeFilter && type !== typeFilter) continue;
    const name = attrString(entry.attributes, "cn") ?? attrString(entry.attributes, "ou") ?? entry.dn;
    const uacRaw = attrString(entry.attributes, "userAccountControl");
    const sidBuf = attrBuffer(entry.attributes, "objectSid");
    summaries.push({
      dn: entry.dn,
      name,
      type,
      description: attrString(entry.attributes, "description"),
      enabled: uacRaw ? isAccountEnabled(Number(uacRaw)) : undefined,
      objectSid: sidBuf ? sidBufferToString(sidBuf) : undefined,
    });
  }
  return summaries;
}

/**
 * Reverse of the name-based search above: resolves a literal SID (as found
 * as an ACE trustee in a GPO's DACL) back to its directory object, for
 * displaying Security Filtering / Delegation entries by name rather than
 * raw SID. Well-known SIDs/SDDL aliases have no AD object and must be
 * resolved separately via wellKnownSids.ts before falling back to this.
 */
export async function findObjectBySid(client: ldap.Client, baseDn: string, sid: string): Promise<DirectoryObjectSummary | undefined> {
  const entries = await search(client, baseDn, {
    scope: "sub",
    filter: `(objectSid=${escapeLdapFilter(sid)})`,
    attributes: ["objectClass", "name", "cn", "ou", "description", "userAccountControl", "objectSid"],
    sizeLimit: 1,
  });
  const entry = entries[0];
  if (!entry) return undefined;
  const objectClasses = (Array.isArray(entry.attributes.objectClass) ? entry.attributes.objectClass : [entry.attributes.objectClass]) as string[];
  const type = classifyObject(objectClasses);
  if (!type) return undefined;
  const name = attrString(entry.attributes, "cn") ?? attrString(entry.attributes, "ou") ?? entry.dn;
  const uacRaw = attrString(entry.attributes, "userAccountControl");
  return {
    dn: entry.dn,
    name,
    type,
    description: attrString(entry.attributes, "description"),
    enabled: uacRaw ? isAccountEnabled(Number(uacRaw)) : undefined,
    objectSid: sid,
  };
}
