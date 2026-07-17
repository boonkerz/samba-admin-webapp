import ldap from "ldapjs";
import { existsSync, readFileSync } from "node:fs";
import { config } from "../config.js";
import { readProvisionSummary } from "../state/provisionState.js";
import { realmToBaseDn, escapeLdapFilter } from "../directory/ldapUtil.js";

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthenticatedIdentity {
  username: string;
  distinguishedName: string;
  displayName?: string;
  groups: string[];
}

const CA_CERT_PATH = "/var/lib/samba/private/tls/ca.pem";

function createClient(): ldap.Client {
  const tlsOptions: Record<string, unknown> = {
    // We always connect to 127.0.0.1 (this app only ever talks to the DC it
    // runs on), but Samba's generated certificate is issued for the DC's
    // hostname/realm, not the literal loopback IP/name — so the CA chain is
    // still verified (below), but hostname/SAN matching is skipped since it
    // can never match "127.0.0.1" regardless of how the cert is issued.
    checkServerIdentity: () => undefined,
  };
  if (existsSync(CA_CERT_PATH)) {
    tlsOptions.ca = [readFileSync(CA_CERT_PATH)];
  } else {
    // Falls back to opportunistic trust only if the DC's own generated CA
    // isn't present yet (e.g. first boot before provisioning finished).
    tlsOptions.rejectUnauthorized = false;
  }
  const client = ldap.createClient({ url: config.ldapsUrl, tlsOptions, timeout: 10_000, connectTimeout: 10_000 });
  // ldapjs emits 'error' on connection failures (e.g. reconnect/backoff);
  // an EventEmitter with no 'error' listener throws and crashes the whole
  // process, so every client we hand out needs one, even though the actual
  // failure is surfaced to the caller via the bind()/search() callbacks.
  client.on("error", () => {});
  return client;
}

function bindAsync(client: ldap.Client, dn: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => (err ? reject(err) : resolve()));
  });
}

function searchAsync(client: ldap.Client, baseDn: string, filter: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const entries: Record<string, unknown>[] = [];
    client.search(baseDn, { scope: "sub", filter, attributes: ["distinguishedName", "displayName", "memberOf"] }, (err, response) => {
      if (err) return reject(err);
      response.on("searchEntry", (entry) => entries.push(entry.pojo.attributes.reduce((acc: Record<string, unknown>, attr) => {
        acc[attr.type] = attr.values.length === 1 ? attr.values[0] : attr.values;
        return acc;
      }, {})));
      response.on("error", reject);
      response.on("end", () => resolve(entries));
    });
  });
}

function unbindQuiet(client: ldap.Client): void {
  client.unbind(() => { });
}

/**
 * Verifies username/password via LDAP simple bind against the local Samba AD
 * DC, then confirms Domain/Enterprise Admins membership. Returns the
 * identity on success; the caller is responsible for what (if anything) of
 * the credential it retains for subsequent per-request rebinds.
 */
export async function verifyCredentials(username: string, password: string): Promise<AuthenticatedIdentity> {
  const summary = readProvisionSummary();
  if (!summary) throw new AuthError("Domain is not provisioned yet.");

  const client = createClient();
  const bindDn = `${username}@${summary.realm}`;
  try {
    await bindAsync(client, bindDn, password);

    const baseDn = realmToBaseDn(summary.realm);
    const entries = await searchAsync(client, baseDn, `(sAMAccountName=${escapeLdapFilter(username)})`);
    const entry = entries[0];
    if (!entry) throw new AuthError("User not found in directory.");

    const memberOf = ([] as string[]).concat((entry.memberOf as string | string[] | undefined) ?? []);
    const isAdmin = memberOf.some((dn) => /^CN=(Domain Admins|Enterprise Admins),/i.test(dn));
    if (!isAdmin) {
      throw new AuthError("User is not a member of Domain Admins or Enterprise Admins.");
    }

    return {
      username,
      distinguishedName: (entry.distinguishedName as string) ?? bindDn,
      displayName: entry.displayName as string | undefined,
      groups: memberOf,
    };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("Invalid credentials.");
  } finally {
    unbindQuiet(client);
  }
}

/** Re-binds with a stored (decrypted) credential to confirm it is still valid before use in a directory request. */
export async function rebind(username: string, password: string): Promise<ldap.Client> {
  const summary = readProvisionSummary();
  if (!summary) throw new AuthError("Domain is not provisioned yet.");
  const client = createClient();
  await bindAsync(client, `${username}@${summary.realm}`, password);
  return client;
}
