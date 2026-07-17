import type ldap from "ldapjs";
import type { TreeNode } from "@samba-admin/shared";
import { search, attrString, add, del } from "./ldapClient.js";

const CONTAINER_FILTER = "(|(objectClass=organizationalUnit)(objectClass=container)(objectClass=builtinDomain))";

function nodeType(objectClasses: string[]): TreeNode["type"] {
  if (objectClasses.includes("domainDNS") || objectClasses.includes("domain")) return "domain";
  if (objectClasses.includes("organizationalUnit")) return "ou";
  return "container";
}

/** Real ADUC hides objects flagged showInAdvancedViewOnly=TRUE (e.g. Program Data, System, Keys) unless "Advanced Features" is on. */
function isAdvancedOnly(attrs: Record<string, unknown>): boolean {
  return attrString(attrs, "showInAdvancedViewOnly")?.toUpperCase() === "TRUE";
}

async function toTreeNode(client: ldap.Client, dn: string, name: string, objectClasses: string[], showAdvanced: boolean): Promise<TreeNode> {
  const children = await search(client, dn, { scope: "one", filter: CONTAINER_FILTER, attributes: ["objectClass", "showInAdvancedViewOnly"] });
  const visibleChildren = showAdvanced ? children : children.filter((c) => !isAdvancedOnly(c.attributes));
  return { dn, name, type: nodeType(objectClasses), hasChildren: visibleChildren.length > 0 };
}

export async function getTreeRoot(client: ldap.Client, baseDn: string, showAdvanced: boolean): Promise<TreeNode> {
  const entries = await search(client, baseDn, { scope: "base", filter: "(objectClass=*)", attributes: ["objectClass", "name"] });
  const entry = entries[0];
  const objectClasses = entry ? (Array.isArray(entry.attributes.objectClass) ? (entry.attributes.objectClass as string[]) : [String(entry.attributes.objectClass)]) : [];
  return toTreeNode(client, baseDn, attrString(entry?.attributes ?? {}, "name") ?? baseDn, objectClasses, showAdvanced);
}

export async function getTreeChildren(client: ldap.Client, parentDn: string, showAdvanced: boolean): Promise<TreeNode[]> {
  const entries = await search(client, parentDn, {
    scope: "one",
    filter: CONTAINER_FILTER,
    attributes: ["objectClass", "name", "ou", "cn", "showInAdvancedViewOnly"],
  });
  const visible = showAdvanced ? entries : entries.filter((e) => !isAdvancedOnly(e.attributes));
  return Promise.all(
    visible.map(async (entry) => {
      const objectClasses = (Array.isArray(entry.attributes.objectClass) ? entry.attributes.objectClass : [entry.attributes.objectClass]) as string[];
      const name = attrString(entry.attributes, "ou") ?? attrString(entry.attributes, "cn") ?? attrString(entry.attributes, "name") ?? entry.dn;
      return toTreeNode(client, entry.dn, name, objectClasses, showAdvanced);
    })
  );
}

export async function createOu(client: ldap.Client, parentDn: string, name: string, description?: string): Promise<string> {
  const dn = `OU=${name},${parentDn}`;
  const attrs: Record<string, unknown> = { objectClass: ["top", "organizationalUnit"], ou: name };
  if (description) attrs.description = description;
  await add(client, dn, attrs);
  return dn;
}

export async function deleteOu(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}
