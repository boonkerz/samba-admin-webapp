import type ldap from "ldapjs";
import type { AdGroup, CreateGroupRequest } from "@samba-admin/shared";
import { search, add, modify, del, attrString, attrStringArray, buildChange } from "./ldapClient.js";

const GROUP_TYPE = {
  GLOBAL: 0x00000002,
  DOMAIN_LOCAL: 0x00000004,
  UNIVERSAL: 0x00000008,
  SECURITY: 0x80000000,
};

function groupTypeValue(scope: AdGroup["groupScope"], type: AdGroup["groupType"]): number {
  const scopeBit = scope === "global" ? GROUP_TYPE.GLOBAL : scope === "universal" ? GROUP_TYPE.UNIVERSAL : GROUP_TYPE.DOMAIN_LOCAL;
  const securityBit = type === "security" ? GROUP_TYPE.SECURITY : 0;
  // groupType is a signed 32-bit value; the security bit sets the sign bit.
  return (scopeBit | securityBit) | 0;
}

function parseGroupType(raw: number): { groupType: AdGroup["groupType"]; groupScope: AdGroup["groupScope"] } {
  const groupType = raw & GROUP_TYPE.SECURITY ? "security" : "distribution";
  const groupScope = raw & GROUP_TYPE.GLOBAL ? "global" : raw & GROUP_TYPE.UNIVERSAL ? "universal" : "domainLocal";
  return { groupType, groupScope };
}

function toAdGroup(dn: string, attrs: Record<string, unknown>): AdGroup {
  const raw = Number(attrString(attrs, "groupType") ?? 0);
  const { groupType, groupScope } = parseGroupType(raw);
  return {
    dn,
    sAMAccountName: attrString(attrs, "sAMAccountName") ?? "",
    description: attrString(attrs, "description"),
    members: attrStringArray(attrs, "member"),
    groupType,
    groupScope,
  };
}

export async function getGroup(client: ldap.Client, dn: string): Promise<AdGroup | undefined> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=group)", attributes: ["*", "member"] });
  const entry = entries[0];
  return entry ? toAdGroup(entry.dn, entry.attributes) : undefined;
}

export async function createGroup(client: ldap.Client, req: CreateGroupRequest): Promise<string> {
  const dn = `CN=${req.sAMAccountName},${req.parentOuDn}`;
  await add(client, dn, {
    objectClass: ["top", "group"],
    cn: req.sAMAccountName,
    sAMAccountName: req.sAMAccountName,
    description: req.description,
    groupType: String(groupTypeValue(req.groupScope, req.groupType)),
  });
  return dn;
}

export async function updateGroup(client: ldap.Client, dn: string, description?: string): Promise<void> {
  if (description === undefined) return;
  await modify(client, dn, [buildChange("replace", "description", description)]);
}

export async function deleteGroup(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}

export async function addGroupMember(client: ldap.Client, groupDn: string, memberDn: string): Promise<void> {
  await modify(client, groupDn, [buildChange("add", "member", memberDn)]);
}

export async function removeGroupMember(client: ldap.Client, groupDn: string, memberDn: string): Promise<void> {
  await modify(client, groupDn, [buildChange("delete", "member", memberDn)]);
}
