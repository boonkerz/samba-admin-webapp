import type ldap from "ldapjs";
import type { GpoAdvancedAce, GpoAdvancedRightsFlags } from "@samba-admin/shared";
import { getGpoSddl, setGpoSddl, parseSddl, serializeSddl, rightsSet, gpoDnOf, APPLY_GROUP_POLICY_RIGHT_GUID, type SddlAce } from "./gpo-dacl.js";
import { resolvePrincipal } from "./gpo-security.service.js";

/** Real GPMC always shows these as fixed, non-removable entries on every GPO. */
const SYSTEM_ALIASES = new Set(["SY", "DA", "EA", "CO", "ED"]);

function isApplyGroupPolicyAce(ace: SddlAce, deny: boolean): boolean {
  return ace.type === (deny ? "OD" : "OA") && rightsSet(ace.rights).has("CR") && (ace.objectGuid ?? "").toLowerCase() === APPLY_GROUP_POLICY_RIGHT_GUID;
}

function flagsFromRights(rights: string | undefined): Omit<GpoAdvancedRightsFlags, "applyGroupPolicy"> {
  const set = rightsSet(rights ?? "");
  return {
    read: ["LC", "RP", "LO", "RC"].every((r) => set.has(r)),
    write: set.has("WP"),
    createAllChild: set.has("CC"),
    deleteAllChild: set.has("DC"),
  };
}

function rightsFromFlags(flags: Omit<GpoAdvancedRightsFlags, "applyGroupPolicy">): string {
  let rights = "";
  if (flags.read) rights += "LCRPLORC";
  if (flags.write) rights += "WP";
  if (flags.createAllChild) rights += "CC";
  if (flags.deleteAllChild) rights += "DC";
  return rights;
}

/** Read-model for real GPMC's Delegierung > "Erweitert..." dialog: per-principal Zulassen/Verweigern checkboxes. */
export async function getGpoAdvancedSecurity(client: ldap.Client, domainDn: string, guid: string): Promise<GpoAdvancedAce[]> {
  const sddl = await getGpoSddl(gpoDnOf(domainDn, guid));
  const parsed = parseSddl(sddl);

  const trustees = new Set(parsed.dacl.map((ace) => ace.trustee));
  const result: GpoAdvancedAce[] = [];
  for (const trustee of trustees) {
    const allowPlain = parsed.dacl.find((a) => a.trustee === trustee && a.type === "A" && !a.objectGuid);
    const denyPlain = parsed.dacl.find((a) => a.trustee === trustee && a.type === "D" && !a.objectGuid);
    const allowApplyGp = parsed.dacl.some((a) => a.trustee === trustee && isApplyGroupPolicyAce(a, false));
    const denyApplyGp = parsed.dacl.some((a) => a.trustee === trustee && isApplyGroupPolicyAce(a, true));
    if (!allowPlain && !denyPlain && !allowApplyGp && !denyApplyGp) continue;

    const principal = await resolvePrincipal(client, domainDn, trustee);
    result.push({
      ...principal,
      inherited: SYSTEM_ALIASES.has(trustee),
      allow: { ...flagsFromRights(allowPlain?.rights), applyGroupPolicy: allowApplyGp },
      deny: { ...flagsFromRights(denyPlain?.rights), applyGroupPolicy: denyApplyGp },
    });
  }
  return result;
}

export async function setGpoAdvancedPermission(
  domainDn: string,
  guid: string,
  sid: string,
  allow: GpoAdvancedRightsFlags,
  deny: GpoAdvancedRightsFlags
): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  if (SYSTEM_ALIASES.has(sid)) throw new Error("Diese Standardberechtigung kann nicht geändert werden.");

  parsed.dacl = parsed.dacl.filter((ace) => {
    if (ace.trustee !== sid) return true;
    if (ace.type === "A" && !ace.objectGuid) return false;
    if (ace.type === "D" && !ace.objectGuid) return false;
    if (isApplyGroupPolicyAce(ace, false) || isApplyGroupPolicyAce(ace, true)) return false;
    return true;
  });

  // Canonical ACE ordering places explicit denies before explicit allows.
  const denyRights = rightsFromFlags(deny);
  if (deny.applyGroupPolicy) {
    parsed.dacl.unshift({ type: "OD", flags: "CI", rights: "CR", objectGuid: APPLY_GROUP_POLICY_RIGHT_GUID, inheritObjectGuid: "", trustee: sid });
  }
  if (denyRights) parsed.dacl.unshift({ type: "D", flags: "CI", rights: denyRights, trustee: sid });

  const allowRights = rightsFromFlags(allow);
  if (allowRights) parsed.dacl.push({ type: "A", flags: "CI", rights: allowRights, trustee: sid });
  if (allow.applyGroupPolicy) {
    parsed.dacl.push({ type: "OA", flags: "CI", rights: "CR", objectGuid: APPLY_GROUP_POLICY_RIGHT_GUID, inheritObjectGuid: "", trustee: sid });
  }

  await setGpoSddl(gpoDn, serializeSddl(parsed));
}

export async function removeGpoAdvancedPrincipal(domainDn: string, guid: string, sid: string): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  if (SYSTEM_ALIASES.has(sid)) throw new Error("Diese Standardberechtigung kann nicht entfernt werden.");

  parsed.dacl = parsed.dacl.filter((ace) => ace.trustee !== sid);
  await setGpoSddl(gpoDn, serializeSddl(parsed));
}
