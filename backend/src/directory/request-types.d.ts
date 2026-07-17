import type ldap from "ldapjs";

declare global {
  namespace Express {
    interface Request {
      ldapClient?: ldap.Client;
      baseDn?: string;
    }
  }
}
