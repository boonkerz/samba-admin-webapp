/**
 * Samba's own SDDL renderer (`security.descriptor.as_sddl()`, used by
 * gpo-security.py) writes well-known trustees using their short two-letter
 * SDDL alias (e.g. "AU", "SY", "DA") instead of a full SID string — these
 * have no AD object of their own, so they can't be resolved via a directory
 * search the way a real user/group/computer DN can.
 *
 * Domain-relative aliases (DA/EA/DU/DC/...) resolve to *this* domain's own
 * built-in groups regardless of which literal SID they carry underneath, so
 * a name here is enough — no domain SID math needed for display purposes.
 */
export const SDDL_ALIAS_NAMES: Record<string, string> = {
  AN: "Anonymous",
  AO: "Konten-Operatoren",
  AU: "Authentifizierte Benutzer",
  BA: "Administratoren",
  BG: "Gäste",
  BO: "Sicherungs-Operatoren",
  BU: "Benutzer",
  CA: "Zertifikatserver-Administratoren",
  CG: "Ersteller-Gruppe",
  CO: "Ersteller-Besitzer",
  DA: "Domänen-Admins",
  DC: "Domänencomputer",
  DD: "Domänencontroller",
  DG: "Domänen-Gäste",
  DU: "Domänen-Benutzer",
  EA: "Organisations-Admins",
  ED: "Organisations-Domänencontroller",
  IU: "Interaktiv angemeldete Benutzer",
  NO: "Netzwerkkonfigurations-Operatoren",
  NU: "Netzwerkanmeldungsbenutzer",
  PA: "Richtlinien-Admins der Gruppe",
  PO: "Druck-Operatoren",
  PS: "Selbst (Principal Self)",
  RC: "Eingeschränkter Code",
  RD: "Remotedesktopbenutzer",
  RE: "Replikations-Operatoren",
  RS: "RAS-Server",
  SA: "Schema-Admins",
  SO: "Server-Operatoren",
  SU: "Dienstanmeldungsbenutzer",
  SY: "SYSTEM",
  WD: "Jeder",
};

/** True for a trustee field that's a short SDDL alias rather than a literal "S-1-5-..." SID string. */
export function isSddlAlias(trustee: string): boolean {
  return !trustee.startsWith("S-") && trustee in SDDL_ALIAS_NAMES;
}

/**
 * Universal (non-domain-relative) aliases resolved to their real, literal SID — the same SID a
 * principal's token/tokenGroups actually carries. Domain-relative aliases (DA/EA/DU/BA/...) are
 * deliberately excluded: their real SID is "<domain-sid>-<RID>", which differs per domain and
 * needs the domain SID to compute, unlike these fixed universal ones.
 */
export const SDDL_UNIVERSAL_ALIAS_TO_SID: Record<string, string> = {
  WD: "S-1-1-0",
  AU: "S-1-5-11",
  SY: "S-1-5-18",
  CO: "S-1-3-0",
  ED: "S-1-5-9",
  AN: "S-1-5-7",
};

/** Resolves an SDDL trustee (alias or literal SID) to the literal SID a principal's real token would carry, for set-membership comparisons. */
export function trusteeToLiteralSid(trustee: string): string {
  return SDDL_UNIVERSAL_ALIAS_TO_SID[trustee] ?? trustee;
}

/** Full literal SIDs with no AD object at all (as opposed to the two-letter aliases above, which Samba never expands to these in SDDL output, but may appear if a descriptor was authored elsewhere). */
export const WELL_KNOWN_LITERAL_SIDS: Record<string, string> = {
  "S-1-1-0": "Jeder",
  "S-1-5-11": "Authentifizierte Benutzer",
  "S-1-5-18": "SYSTEM",
  "S-1-5-9": "Organisations-Domänencontroller",
  "S-1-3-0": "Ersteller-Besitzer",
  "S-1-5-32-544": "Administratoren",
};
