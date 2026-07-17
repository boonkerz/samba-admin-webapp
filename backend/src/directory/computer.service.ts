import type ldap from "ldapjs";
import type { AdComputer, UpdateComputerRequest } from "@samba-admin/shared";
import { search, modify, modifyDn, del, attrString, attrStringArray, buildChange } from "./ldapClient.js";
import { isAccountEnabled, withAccountEnabled, UAC } from "./ldapUtil.js";

function toAdComputer(dn: string, attrs: Record<string, unknown>): AdComputer {
  const uacRaw = Number(attrString(attrs, "userAccountControl") ?? UAC.WORKSTATION_TRUST_ACCOUNT);
  return {
    dn,
    name: attrString(attrs, "cn") ?? "",
    sAMAccountName: attrString(attrs, "sAMAccountName") ?? "",
    dNSHostName: attrString(attrs, "dNSHostName"),
    operatingSystem: attrString(attrs, "operatingSystem"),
    operatingSystemVersion: attrString(attrs, "operatingSystemVersion"),
    operatingSystemServicePack: attrString(attrs, "operatingSystemServicePack"),
    description: attrString(attrs, "description"),
    managedBy: attrString(attrs, "managedBy"),
    memberOf: attrStringArray(attrs, "memberOf"),
    enabled: isAccountEnabled(uacRaw),
    lastLogonTimestamp: attrString(attrs, "lastLogonTimestamp"),
  };
}

export async function getComputer(client: ldap.Client, dn: string): Promise<AdComputer | undefined> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=computer)", attributes: ["*", "memberOf"] });
  const entry = entries[0];
  return entry ? toAdComputer(entry.dn, entry.attributes) : undefined;
}

export async function updateComputer(client: ldap.Client, dn: string, updates: UpdateComputerRequest): Promise<void> {
  const changes: ldap.Change[] = Object.entries(updates)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => buildChange("replace", key, value));
  if (changes.length > 0) await modify(client, dn, changes);
}

export async function setComputerEnabled(client: ldap.Client, dn: string, enabled: boolean): Promise<void> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=computer)", attributes: ["userAccountControl"] });
  const currentUac = Number(attrString(entries[0]?.attributes ?? {}, "userAccountControl") ?? UAC.WORKSTATION_TRUST_ACCOUNT);
  const newUac = withAccountEnabled(currentUac, enabled);
  await modify(client, dn, [buildChange("replace", "userAccountControl", String(newUac))]);
}

export async function renameComputer(client: ldap.Client, dn: string, newName: string): Promise<string> {
  const newRdn = `CN=${newName}`;
  await modifyDn(client, dn, newRdn);
  const parentDn = dn.slice(dn.indexOf(",") + 1);
  return `${newRdn},${parentDn}`;
}

export async function deleteComputer(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}
