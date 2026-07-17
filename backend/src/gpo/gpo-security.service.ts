import type ldap from "ldapjs";
import type { GpoSecurityPrincipal } from "@samba-admin/shared";
import {
  getGpoSddl,
  setGpoSddl,
  parseSddl,
  serializeSddl,
  rightsSet,
  isReadRights,
  gpoDnOf,
  APPLY_GROUP_POLICY_RIGHT_GUID,
  type SddlAce,
} from "./gpo-dacl.js";
import { isSddlAlias, SDDL_ALIAS_NAMES, WELL_KNOWN_LITERAL_SIDS } from "../directory/wellKnownSids.js";
import { findObjectBySid } from "../directory/objects.service.js";

export async function resolvePrincipal(client: ldap.Client, domainDn: string, trustee: string): Promise<GpoSecurityPrincipal> {
  if (isSddlAlias(trustee)) {
    return { sid: trustee, name: SDDL_ALIAS_NAMES[trustee], type: "wellknown" };
  }
  if (trustee in WELL_KNOWN_LITERAL_SIDS) {
    return { sid: trustee, name: WELL_KNOWN_LITERAL_SIDS[trustee], type: "wellknown" };
  }
  const obj = await findObjectBySid(client, domainDn, trustee);
  if (obj) {
    return { sid: trustee, name: obj.name, type: obj.type === "user" || obj.type === "computer" ? obj.type : "group" };
  }
  return { sid: trustee, name: trustee, type: "wellknown" };
}

function isApplyGroupPolicyAce(ace: SddlAce): boolean {
  return ace.type === "OA" && rightsSet(ace.rights).has("CR") && (ace.objectGuid ?? "").toLowerCase() === APPLY_GROUP_POLICY_RIGHT_GUID;
}

/**
 * "Security Filtering" = every trustee holding the object-specific "Apply
 * Group Policy" extended-right ACE (real GPMC's exact semantics — a plain
 * Read ACE alone doesn't count, only Read + Apply GP together).
 */
export async function getGpoSecurityPrincipals(client: ldap.Client, domainDn: string, guid: string): Promise<GpoSecurityPrincipal[]> {
  const sddl = await getGpoSddl(gpoDnOf(domainDn, guid));
  const parsed = parseSddl(sddl);

  const trustees = new Set(parsed.dacl.filter(isApplyGroupPolicyAce).map((ace) => ace.trustee));
  const principals: GpoSecurityPrincipal[] = [];
  for (const trustee of trustees) {
    principals.push(await resolvePrincipal(client, domainDn, trustee));
  }
  return principals;
}

/** Adds both ACEs real GPME writes together for Security Filtering: the object-specific Apply-GP ACE and a plain Read ACE (if not already present). */
export async function addSecurityFilterPrincipal(domainDn: string, guid: string, sid: string): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  if (!parsed.dacl.some((ace) => ace.trustee === sid && isApplyGroupPolicyAce(ace))) {
    parsed.dacl.push({ type: "OA", flags: "CI", rights: "CR", objectGuid: APPLY_GROUP_POLICY_RIGHT_GUID, inheritObjectGuid: "", trustee: sid });
  }
  if (!parsed.dacl.some((ace) => ace.trustee === sid && ace.type === "A" && isReadRights(ace.rights))) {
    parsed.dacl.push({ type: "A", flags: "CI", rights: "LCRPLORC", trustee: sid });
  }

  await setGpoSddl(gpoDn, serializeSddl(parsed));
}

/** Removes exactly the two Security-Filtering ACEs for this trustee, leaving any unrelated (e.g. Delegation) ACEs for the same trustee untouched. */
export async function removeSecurityFilterPrincipal(domainDn: string, guid: string, sid: string): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);

  parsed.dacl = parsed.dacl.filter((ace) => {
    if (ace.trustee !== sid) return true;
    if (isApplyGroupPolicyAce(ace)) return false;
    if (ace.type === "A" && isReadRights(ace.rights)) return false;
    return true;
  });

  await setGpoSddl(gpoDn, serializeSddl(parsed));
}
