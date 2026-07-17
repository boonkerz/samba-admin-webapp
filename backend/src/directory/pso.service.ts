import type ldap from "ldapjs";
import type { PasswordSettingsObject, CreatePsoRequest, UpdatePsoRequest } from "@samba-admin/shared";
import { search, add, modify, del, attrString, attrStringArray, buildChange } from "./ldapClient.js";
import { daysToNegativeInterval, negativeIntervalToDays, minutesToNegativeInterval, negativeIntervalToMinutes } from "./ldapUtil.js";

function containerDn(domainDn: string): string {
  return `CN=Password Settings Container,CN=System,${domainDn}`;
}

function toPso(entry: { dn: string; attributes: Record<string, unknown> }): PasswordSettingsObject {
  const attrs = entry.attributes;
  return {
    dn: entry.dn,
    name: attrString(attrs, "name") ?? attrString(attrs, "cn") ?? entry.dn,
    precedence: Number(attrString(attrs, "msDS-PasswordSettingsPrecedence") ?? "0"),
    passwordHistoryLength: Number(attrString(attrs, "msDS-PasswordHistoryLength") ?? "0"),
    passwordComplexityEnabled: attrString(attrs, "msDS-PasswordComplexityEnabled") === "TRUE",
    reversibleEncryptionEnabled: attrString(attrs, "msDS-PasswordReversibleEncryptionEnabled") === "TRUE",
    minimumPasswordLengthChars: Number(attrString(attrs, "msDS-MinimumPasswordLength") ?? "0"),
    minimumPasswordAgeDays: negativeIntervalToDays(attrString(attrs, "msDS-MinimumPasswordAge")),
    maximumPasswordAgeDays: negativeIntervalToDays(attrString(attrs, "msDS-MaximumPasswordAge")),
    lockoutThreshold: Number(attrString(attrs, "msDS-LockoutThreshold") ?? "0"),
    lockoutDurationMinutes: negativeIntervalToMinutes(attrString(attrs, "msDS-LockoutDuration")),
    lockoutObservationWindowMinutes: negativeIntervalToMinutes(attrString(attrs, "msDS-LockoutObservationWindow")),
    appliesTo: attrStringArray(attrs, "msDS-PSOAppliesTo"),
  };
}

const PSO_ATTRIBUTES = [
  "name",
  "cn",
  "msDS-PasswordSettingsPrecedence",
  "msDS-PasswordHistoryLength",
  "msDS-PasswordComplexityEnabled",
  "msDS-PasswordReversibleEncryptionEnabled",
  "msDS-MinimumPasswordLength",
  "msDS-MinimumPasswordAge",
  "msDS-MaximumPasswordAge",
  "msDS-LockoutThreshold",
  "msDS-LockoutDuration",
  "msDS-LockoutObservationWindow",
  "msDS-PSOAppliesTo",
];

export async function listPsos(client: ldap.Client, domainDn: string): Promise<PasswordSettingsObject[]> {
  const entries = await search(client, containerDn(domainDn), {
    scope: "one",
    filter: "(objectClass=msDS-PasswordSettings)",
    attributes: PSO_ATTRIBUTES,
  });
  return entries.map(toPso);
}

export async function createPso(client: ldap.Client, domainDn: string, req: CreatePsoRequest): Promise<string> {
  const dn = `CN=${req.name},${containerDn(domainDn)}`;
  await add(client, dn, {
    objectClass: ["top", "msDS-PasswordSettings"],
    "msDS-PasswordSettingsPrecedence": String(req.precedence),
    "msDS-PasswordHistoryLength": String(req.passwordHistoryLength),
    "msDS-PasswordComplexityEnabled": req.passwordComplexityEnabled ? "TRUE" : "FALSE",
    "msDS-PasswordReversibleEncryptionEnabled": req.reversibleEncryptionEnabled ? "TRUE" : "FALSE",
    "msDS-MinimumPasswordLength": String(req.minimumPasswordLengthChars),
    "msDS-MinimumPasswordAge": daysToNegativeInterval(req.minimumPasswordAgeDays),
    "msDS-MaximumPasswordAge": daysToNegativeInterval(req.maximumPasswordAgeDays),
    "msDS-LockoutThreshold": String(req.lockoutThreshold),
    "msDS-LockoutDuration": minutesToNegativeInterval(req.lockoutDurationMinutes),
    "msDS-LockoutObservationWindow": minutesToNegativeInterval(req.lockoutObservationWindowMinutes),
  });
  return dn;
}

export async function updatePso(client: ldap.Client, dn: string, updates: UpdatePsoRequest): Promise<void> {
  const changes: ldap.Change[] = [];
  if (updates.precedence !== undefined) changes.push(buildChange("replace", "msDS-PasswordSettingsPrecedence", String(updates.precedence)));
  if (updates.passwordHistoryLength !== undefined)
    changes.push(buildChange("replace", "msDS-PasswordHistoryLength", String(updates.passwordHistoryLength)));
  if (updates.passwordComplexityEnabled !== undefined)
    changes.push(buildChange("replace", "msDS-PasswordComplexityEnabled", updates.passwordComplexityEnabled ? "TRUE" : "FALSE"));
  if (updates.reversibleEncryptionEnabled !== undefined)
    changes.push(buildChange("replace", "msDS-PasswordReversibleEncryptionEnabled", updates.reversibleEncryptionEnabled ? "TRUE" : "FALSE"));
  if (updates.minimumPasswordLengthChars !== undefined)
    changes.push(buildChange("replace", "msDS-MinimumPasswordLength", String(updates.minimumPasswordLengthChars)));
  if (updates.minimumPasswordAgeDays !== undefined)
    changes.push(buildChange("replace", "msDS-MinimumPasswordAge", daysToNegativeInterval(updates.minimumPasswordAgeDays)));
  if (updates.maximumPasswordAgeDays !== undefined)
    changes.push(buildChange("replace", "msDS-MaximumPasswordAge", daysToNegativeInterval(updates.maximumPasswordAgeDays)));
  if (updates.lockoutThreshold !== undefined) changes.push(buildChange("replace", "msDS-LockoutThreshold", String(updates.lockoutThreshold)));
  if (updates.lockoutDurationMinutes !== undefined)
    changes.push(buildChange("replace", "msDS-LockoutDuration", minutesToNegativeInterval(updates.lockoutDurationMinutes)));
  if (updates.lockoutObservationWindowMinutes !== undefined)
    changes.push(buildChange("replace", "msDS-LockoutObservationWindow", minutesToNegativeInterval(updates.lockoutObservationWindowMinutes)));
  if (changes.length > 0) await modify(client, dn, changes);
}

export async function deletePso(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}

export async function addPsoAppliesTo(client: ldap.Client, psoDn: string, targetDn: string): Promise<void> {
  await modify(client, psoDn, [buildChange("add", "msDS-PSOAppliesTo", targetDn)]);
}

export async function removePsoAppliesTo(client: ldap.Client, psoDn: string, targetDn: string): Promise<void> {
  await modify(client, psoDn, [buildChange("delete", "msDS-PSOAppliesTo", targetDn)]);
}
