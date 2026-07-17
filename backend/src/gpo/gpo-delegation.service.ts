import type ldap from "ldapjs";
import type { GpoDelegationEntry, GpoDelegationPermission } from "@samba-admin/shared";
import {
  getGpoSddl,
  setGpoSddl,
  parseSddl,
  serializeSddl,
  isReadRights,
  isEditRights,
  isFullControlRights,
  gpoDnOf,
  type SddlAce,
} from "./gpo-dacl.js";
import { resolvePrincipal } from "./gpo-security.service.js";

/** Real GPMC always shows these as fixed, non-removable Full Control entries on every GPO. */
const SYSTEM_ALIASES = new Set(["SY", "DA", "EA", "CO", "ED"]);

function permissionOf(rights: string): GpoDelegationPermission | undefined {
  if (isFullControlRights(rights)) return "editDeleteModifySecurity";
  if (isEditRights(rights)) return "edit";
  if (isReadRights(rights)) return "read";
  return undefined;
}

const RIGHTS_FOR_PERMISSION: Record<GpoDelegationPermission, string> = {
  read: "LCRPLORC",
  edit: "LCRPLORCWP",
  editDeleteModifySecurity: "CCDCLCSWRPWPDTLOSDRCWDWO",
};

function isPlainDelegationAce(ace: SddlAce): boolean {
  return ace.type === "A" && !ace.objectGuid;
}

function hasApplyGroupPolicy(dacl: SddlAce[], sid: string): boolean {
  return dacl.some((ace) => ace.type === "OA" && ace.trustee === sid && ace.rights.includes("CR"));
}

/**
 * Delegation entries with `inherited: true` are never removable from this
 * tab in real GPMC either: the fixed system defaults (SYSTEM/Domain Admins/
 * Enterprise Admins/Creator Owner/Enterprise Domain Controllers) present on
 * every GPO, and any Read entry that's actually the paired ACE underlying a
 * Security Filtering principal (removable only via Security Filtering,
 * since removing just the Read half there would leave a client able to see
 * "Apply" but not read the policy — a broken half-applied state).
 */
export async function getGpoDelegation(client: ldap.Client, domainDn: string, guid: string): Promise<GpoDelegationEntry[]> {
  const sddl = await getGpoSddl(gpoDnOf(domainDn, guid));
  const parsed = parseSddl(sddl);

  const entries: GpoDelegationEntry[] = [];
  const seen = new Set<string>();
  for (const ace of parsed.dacl) {
    if (!isPlainDelegationAce(ace)) continue;
    const permission = permissionOf(ace.rights);
    if (!permission) continue;

    // The real default DACL sometimes carries two separate ACEs for the
    // same trustee+permission (e.g. Domain Admins with and without the CI
    // flag) — collapse those into one row rather than showing duplicates.
    const dedupeKey = `${ace.trustee}:${permission}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const principal = await resolvePrincipal(client, domainDn, ace.trustee);
    const inherited = SYSTEM_ALIASES.has(ace.trustee) || hasApplyGroupPolicy(parsed.dacl, ace.trustee);
    entries.push({ ...principal, permission, inherited });
  }
  return entries;
}

export async function addDelegationPrincipal(domainDn: string, guid: string, sid: string, permission: GpoDelegationPermission): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  parsed.dacl = parsed.dacl.filter((ace) => !(isPlainDelegationAce(ace) && ace.trustee === sid && permissionOf(ace.rights)));
  parsed.dacl.push({ type: "A", flags: "CI", rights: RIGHTS_FOR_PERMISSION[permission], trustee: sid });

  await setGpoSddl(gpoDn, serializeSddl(parsed));
}

export async function updateDelegationPermission(domainDn: string, guid: string, sid: string, permission: GpoDelegationPermission): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  if (SYSTEM_ALIASES.has(sid)) throw new Error("Diese Standardberechtigung kann nicht geändert werden.");

  parsed.dacl = parsed.dacl.filter((ace) => !(isPlainDelegationAce(ace) && ace.trustee === sid && permissionOf(ace.rights)));
  parsed.dacl.push({ type: "A", flags: "CI", rights: RIGHTS_FOR_PERMISSION[permission], trustee: sid });

  await setGpoSddl(gpoDn, serializeSddl(parsed));
}

export async function removeDelegationPrincipal(domainDn: string, guid: string, sid: string): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  if (SYSTEM_ALIASES.has(sid)) throw new Error("Diese Standardberechtigung kann nicht entfernt werden.");
  if (hasApplyGroupPolicy(parsed.dacl, sid)) {
    throw new Error("Dieser Eintrag stammt aus der Sicherheitsfilterung und muss dort entfernt werden.");
  }

  parsed.dacl = parsed.dacl.filter((ace) => !(isPlainDelegationAce(ace) && ace.trustee === sid && permissionOf(ace.rights)));
  await setGpoSddl(gpoDn, serializeSddl(parsed));
}
