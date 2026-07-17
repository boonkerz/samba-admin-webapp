import type ldap from "ldapjs";
import type { AdTrust } from "@samba-admin/shared";
import { search, attrString } from "./ldapClient.js";

const DIRECTION_MAP: Record<string, AdTrust["direction"]> = { "0": "disabled", "1": "inbound", "2": "outbound", "3": "bidirectional" };
const TYPE_MAP: Record<string, AdTrust["type"]> = { "1": "downlevel", "2": "uplevel", "3": "mit", "4": "dce" };

/**
 * Read-only. Real Windows manages trust creation/removal via "Active Directory-Domänen und
 * -Vertrauensstellungen" (domain.msc), but establishing one is an inherently two-sided operation
 * (needs live connectivity + credentials to the partner domain's own DC) — nothing this app can
 * safely automate or verify without a second domain/forest to test against.
 */
export async function listTrusts(client: ldap.Client, domainDn: string): Promise<AdTrust[]> {
  const entries = await search(client, `CN=System,${domainDn}`, {
    scope: "one",
    filter: "(objectClass=trustedDomain)",
    attributes: ["name", "trustPartner", "trustDirection", "trustType"],
  });
  return entries.map((entry) => ({
    dn: entry.dn,
    name: attrString(entry.attributes, "name") ?? entry.dn,
    trustPartner: attrString(entry.attributes, "trustPartner"),
    direction: DIRECTION_MAP[attrString(entry.attributes, "trustDirection") ?? ""] ?? "unknown",
    type: TYPE_MAP[attrString(entry.attributes, "trustType") ?? ""] ?? "unknown",
  }));
}
