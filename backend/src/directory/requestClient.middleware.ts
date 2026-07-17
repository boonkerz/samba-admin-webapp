import type { Request, Response, NextFunction } from "express";
import { rebind } from "../auth/auth.service.js";
import { decryptSecret } from "../auth/crypto.js";
import { readProvisionSummary } from "../state/provisionState.js";
import { realmToBaseDn } from "./ldapUtil.js";

/**
 * Binds a fresh LDAP connection for the duration of this request, using the
 * encrypted credential stored on the session at login. Samba/AD has no
 * session-token concept — every directory operation is authenticated via
 * bind — so a short-lived per-request bind is the natural fit here.
 */
export async function attachLdapClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.username || !req.session.encryptedPassword) {
    res.status(401).json({ error: "not-authenticated", message: "Login required." });
    return;
  }
  const summary = readProvisionSummary();
  if (!summary) {
    res.status(409).json({ error: "not-provisioned", message: "Domain is not provisioned yet." });
    return;
  }

  try {
    const password = decryptSecret(req.session.encryptedPassword);
    const client = await rebind(req.session.username, password);
    req.ldapClient = client;
    req.baseDn = realmToBaseDn(summary.realm);

    res.on("finish", () => client.unbind(() => {}));
    next();
  } catch {
    res.status(401).json({ error: "invalid-session-credential", message: "Stored session credential is no longer valid. Please log in again." });
  }
}
