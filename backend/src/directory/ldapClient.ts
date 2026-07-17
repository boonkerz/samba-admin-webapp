import ldap from "ldapjs";

export type AttributeValue = string | string[] | Buffer | Buffer[];

export interface LdapEntry {
  dn: string;
  attributes: Record<string, AttributeValue>;
}

const BINARY_ATTRIBUTES = new Set(["objectGUID", "objectSid", "tokenGroups"]);

function collectAttributes(entry: ldap.SearchEntry): Record<string, AttributeValue> {
  const attrs: Record<string, AttributeValue> = {};
  for (const attr of entry.attributes) {
    const values: AttributeValue = BINARY_ATTRIBUTES.has(attr.type) ? attr.buffers : attr.values;
    attrs[attr.type] = Array.isArray(values) && values.length === 1 ? values[0] : values;
  }
  return attrs;
}

export class InvalidDnError extends Error {
  constructor(baseDn: string) {
    super(`Refusing to search with an invalid/empty base DN: ${JSON.stringify(baseDn)}`);
    this.name = "InvalidDnError";
  }
}

/** A real DN always has at least one "attr=value" RDN component; catches blank/garbled values before they reach ldapjs's DN parser (which throws an opaque low-level error otherwise). */
function looksLikeDn(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9-]*=/.test(value);
}

export function search(
  client: ldap.Client,
  baseDn: string,
  options: ldap.SearchOptions
): Promise<LdapEntry[]> {
  if (!looksLikeDn(baseDn)) {
    return Promise.reject(new InvalidDnError(baseDn));
  }
  return new Promise((resolve, reject) => {
    const entries: LdapEntry[] = [];
    client.search(baseDn, options, (err, res) => {
      if (err) return reject(err);
      res.on("searchEntry", (entry) => {
        if (!entry.objectName) return; // ldapjs can return a null objectName for some referral/edge-case entries; skip rather than surface a blank DN.
        // Despite the type declarations claiming `string | null`, this ldapjs
        // version's objectName is a DN object at runtime. JSON.stringify()
        // on that object (via Express's res.json()) does NOT call its
        // toString() — it serializes internal fields instead — so without
        // this explicit conversion, `dn` silently becomes a mangled object
        // by the time it reaches the browser (surfaces there as the literal
        // string "[object Object]" wherever it's later template-interpolated).
        entries.push({ dn: String(entry.objectName), attributes: collectAttributes(entry) });
      });
      res.on("error", reject);
      res.on("end", (result) => {
        if (result && result.status !== 0) return reject(new Error(`LDAP search failed with status ${result.status}`));
        resolve(entries);
      });
    });
  });
}

export function add(client: ldap.Client, dn: string, attributes: Record<string, unknown>): Promise<void> {
  // ldapjs's own object-shape normalization calls `.toString()` on every
  // value with no undefined check, so an optional field left unset (e.g.
  // initials) would throw "Cannot read properties of undefined" deep inside
  // ldapjs. Strip undefined keys here, once, at the choke point.
  const cleaned = Object.fromEntries(Object.entries(attributes).filter(([, v]) => v !== undefined));
  return new Promise((resolve, reject) => {
    client.add(dn, cleaned as ldap.Attribute[] | Record<string, unknown>, (err) => (err ? reject(err) : resolve()));
  });
}

export function modify(client: ldap.Client, dn: string, changes: ldap.Change[]): Promise<void> {
  return new Promise((resolve, reject) => {
    client.modify(dn, changes, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Builds a single-attribute ldap.Change. This ldapjs version's own
 * `{ operation, modification: { attrName: value } }` convenience shape is
 * broken against the newer @ldapjs/attribute's stricter validation (it
 * throws "modification must be an Attribute"), so every caller must build
 * the proper `{ type, values }` shape itself instead of relying on that
 * legacy normalization.
 */
export function buildChange(operation: "add" | "delete" | "replace", type: string, value: string | Buffer | Array<string | Buffer>): ldap.Change {
  const values = Array.isArray(value) ? value : [value];
  return new ldap.Change({ operation, modification: { type, values } as unknown as ldap.Attribute });
}

export function modifyDn(client: ldap.Client, dn: string, newRdnOrDn: string, newSuperior?: string): Promise<void> {
  // ldapjs's modifyDN takes `newName` as a single full-DN *string* (it parses
  // it internally and splits off the RDN vs. superior itself) — not an
  // { newRdn, newSuperior } object, despite what older docs/examples imply.
  const newName = newSuperior ? `${newRdnOrDn},${newSuperior}` : newRdnOrDn;
  return new Promise((resolve, reject) => {
    client.modifyDN(dn, newName, (err) => (err ? reject(err) : resolve()));
  });
}

export function del(client: ldap.Client, dn: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.del(dn, (err) => (err ? reject(err) : resolve()));
  });
}

export function attrString(attrs: Record<string, unknown>, key: string): string | undefined {
  const value = attrs[key];
  if (value === undefined) return undefined;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (Array.isArray(value)) return typeof value[0] === "string" ? (value[0] as string) : undefined;
  return value as string;
}

export function attrStringArray(attrs: Record<string, unknown>, key: string): string[] {
  const value = attrs[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => (Buffer.isBuffer(v) ? v.toString("utf8") : (v as string)));
  return [Buffer.isBuffer(value) ? value.toString("utf8") : (value as string)];
}

export function attrBuffer(attrs: Record<string, unknown>, key: string): Buffer | undefined {
  const value = attrs[key];
  if (value === undefined) return undefined;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value) && Buffer.isBuffer(value[0])) return value[0] as Buffer;
  return undefined;
}
