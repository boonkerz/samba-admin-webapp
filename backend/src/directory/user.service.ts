import type ldap from "ldapjs";
import type { AdUser, CreateUserRequest, UpdateUserRequest } from "@samba-admin/shared";
import { search, add, modify, del, attrString, attrStringArray, buildChange } from "./ldapClient.js";
import { UAC, withAccountEnabled, isAccountEnabled, encodeUnicodePwd, fileTimeToIsoDate, isoDateToFileTime, escapeLdapFilter } from "./ldapUtil.js";

/** Maps this app's friendly field names to their actual AD/LDAP attribute names, where they differ. */
const FIELD_TO_LDAP_ATTR: Record<string, string> = {
  office: "physicalDeliveryOfficeName",
  email: "mail",
  homePage: "wWWHomePage",
  poBox: "postOfficeBox",
  city: "l",
  state: "st",
  country: "co",
  fax: "facsimileTelephoneNumber",
  notes: "info",
  callbackNumber: "msRADIUSCallbackNumber",
  tsInitialProgram: "msTSInitialProgram",
  tsWorkDirectory: "msTSWorkDirectory",
  tsMaxDisconnectionTimeMin: "msTSMaxDisconnectionTime",
  tsMaxConnectionTimeMin: "msTSMaxConnectionTime",
  tsMaxIdleTimeMin: "msTSMaxIdleTime",
};

function ldapAttrFor(field: string): string {
  return FIELD_TO_LDAP_ATTR[field] ?? field;
}

async function getReports(client: ldap.Client, dn: string, baseDn: string): Promise<string[]> {
  const entries = await search(client, baseDn, {
    scope: "sub",
    filter: `(manager=${escapeLdapFilter(dn)})`,
    attributes: ["distinguishedName"],
  });
  return entries.map((e) => e.dn);
}

function toAdUser(dn: string, attrs: Record<string, unknown>): AdUser {
  const uac = Number(attrString(attrs, "userAccountControl") ?? UAC.NORMAL_ACCOUNT);
  const pwdLastSet = attrString(attrs, "pwdLastSet");
  return {
    dn,
    sAMAccountName: attrString(attrs, "sAMAccountName") ?? "",
    userPrincipalName: attrString(attrs, "userPrincipalName"),
    givenName: attrString(attrs, "givenName"),
    sn: attrString(attrs, "sn"),
    initials: attrString(attrs, "initials"),
    displayName: attrString(attrs, "displayName"),
    description: attrString(attrs, "description"),
    enabled: isAccountEnabled(uac),
    passwordNeverExpires: (uac & UAC.DONT_EXPIRE_PASSWORD) !== 0,
    mustChangePasswordAtNextLogon: pwdLastSet === "0",
    smartcardRequired: (uac & UAC.SMARTCARD_REQUIRED) !== 0,
    memberOf: attrStringArray(attrs, "memberOf"),

    office: attrString(attrs, "physicalDeliveryOfficeName"),
    telephoneNumber: attrString(attrs, "telephoneNumber"),
    email: attrString(attrs, "mail"),
    homePage: attrString(attrs, "wWWHomePage"),

    streetAddress: attrString(attrs, "streetAddress"),
    poBox: attrString(attrs, "postOfficeBox"),
    city: attrString(attrs, "l"),
    state: attrString(attrs, "st"),
    postalCode: attrString(attrs, "postalCode"),
    country: attrString(attrs, "co"),

    homePhone: attrString(attrs, "homePhone"),
    pager: attrString(attrs, "pager"),
    mobile: attrString(attrs, "mobile"),
    fax: attrString(attrs, "facsimileTelephoneNumber"),
    ipPhone: attrString(attrs, "ipPhone"),
    notes: attrString(attrs, "info"),

    title: attrString(attrs, "title"),
    department: attrString(attrs, "department"),
    company: attrString(attrs, "company"),
    manager: attrString(attrs, "manager"),

    profilePath: attrString(attrs, "profilePath"),
    scriptPath: attrString(attrs, "scriptPath"),
    homeDrive: attrString(attrs, "homeDrive"),
    homeDirectory: attrString(attrs, "homeDirectory"),

    accountExpires: fileTimeToIsoDate(attrString(attrs, "accountExpires")),

    networkAccessPermission: (() => {
      const v = attrString(attrs, "msNPAllowDialin");
      return v === "TRUE" ? "allow" : v === "FALSE" ? "deny" : "policy";
    })(),
    callbackNumber: attrString(attrs, "msRADIUSCallbackNumber"),

    tsInitialProgram: attrString(attrs, "msTSInitialProgram"),
    tsWorkDirectory: attrString(attrs, "msTSWorkDirectory"),
    tsConnectClientDrives: attrString(attrs, "msTSConnectClientDrives") !== "FALSE",
    tsConnectPrinterDrives: attrString(attrs, "msTSConnectPrinterDrives") !== "FALSE",
    tsDefaultToMainPrinter: attrString(attrs, "msTSDefaultToMainPrinter") !== "FALSE",

    tsMaxDisconnectionTimeMin: numOrUndefined(attrString(attrs, "msTSMaxDisconnectionTime")),
    tsMaxConnectionTimeMin: numOrUndefined(attrString(attrs, "msTSMaxConnectionTime")),
    tsMaxIdleTimeMin: numOrUndefined(attrString(attrs, "msTSMaxIdleTime")),
    tsReconnectFromOriginatingClientOnly: attrString(attrs, "msTSReconnectionAction") === "1",
  };
}

function numOrUndefined(v: string | undefined): number | undefined {
  return v === undefined ? undefined : Number(v);
}

export async function getUser(client: ldap.Client, dn: string, baseDn?: string): Promise<AdUser | undefined> {
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=user)", attributes: ["*", "memberOf"] });
  const entry = entries[0];
  if (!entry) return undefined;
  const user = toAdUser(entry.dn, entry.attributes);
  if (baseDn) user.reports = await getReports(client, dn, baseDn);
  return user;
}

export async function createUser(client: ldap.Client, req: CreateUserRequest): Promise<string> {
  const cn = req.fullName?.trim() || `${req.givenName ?? ""} ${req.sn ?? ""}`.trim() || req.sAMAccountName;
  const dn = `CN=${cn},${req.parentOuDn}`;
  let uac = withAccountEnabled(UAC.NORMAL_ACCOUNT, req.enabled);
  if (req.passwordNeverExpires) uac |= UAC.DONT_EXPIRE_PASSWORD;

  await add(client, dn, {
    objectClass: ["top", "person", "organizationalPerson", "user"],
    cn,
    displayName: cn,
    sAMAccountName: req.sAMAccountName,
    userPrincipalName: req.userPrincipalName,
    givenName: req.givenName,
    sn: req.sn,
    initials: req.initials,
    userAccountControl: String(uac),
  });

  // Password writes require an encrypted (LDAPS) connection, which this app always uses.
  await modify(client, dn, [buildChange("replace", "unicodePwd", encodeUnicodePwd(req.password))]);

  if (req.mustChangePasswordAtNextLogon) {
    // pwdLastSet=0 is the standard AD mechanism forcing a password change at next logon.
    await modify(client, dn, [buildChange("replace", "pwdLastSet", "0")]);
  }

  return dn;
}

const UAC_MANAGED_KEYS = new Set(["enabled", "passwordNeverExpires", "smartcardRequired"]);
const BOOLEAN_ATTR_KEYS: Record<string, string> = {
  tsConnectClientDrives: "msTSConnectClientDrives",
  tsConnectPrinterDrives: "msTSConnectPrinterDrives",
  tsDefaultToMainPrinter: "msTSDefaultToMainPrinter",
};
const SPECIAL_KEYS = new Set([
  ...UAC_MANAGED_KEYS,
  "mustChangePasswordAtNextLogon",
  "networkAccessPermission",
  ...Object.keys(BOOLEAN_ATTR_KEYS),
  "tsReconnectFromOriginatingClientOnly",
]);

export async function updateUser(client: ldap.Client, dn: string, updates: UpdateUserRequest): Promise<void> {
  const changes: ldap.Change[] = [];

  const plainEntries = Object.entries(updates).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !SPECIAL_KEYS.has(entry[0])
  );
  for (const [key, value] of plainEntries) {
    if (key === "accountExpires") changes.push(buildChange("replace", "accountExpires", isoDateToFileTime(value)));
    else changes.push(buildChange("replace", ldapAttrFor(key), String(value)));
  }

  for (const [key, attr] of Object.entries(BOOLEAN_ATTR_KEYS)) {
    const value = (updates as Record<string, unknown>)[key];
    if (value !== undefined) changes.push(buildChange("replace", attr, value ? "TRUE" : "FALSE"));
  }

  if (updates.tsReconnectFromOriginatingClientOnly !== undefined) {
    changes.push(buildChange("replace", "msTSReconnectionAction", updates.tsReconnectFromOriginatingClientOnly ? "1" : "0"));
  }

  if (updates.networkAccessPermission !== undefined) {
    if (updates.networkAccessPermission === "policy") {
      changes.push(buildChange("delete", "msNPAllowDialin", []));
    } else {
      changes.push(buildChange("replace", "msNPAllowDialin", updates.networkAccessPermission === "allow" ? "TRUE" : "FALSE"));
    }
  }

  if (updates.enabled !== undefined || updates.passwordNeverExpires !== undefined || updates.smartcardRequired !== undefined) {
    const entries = await search(client, dn, { scope: "base", filter: "(objectClass=user)", attributes: ["userAccountControl"] });
    let uac = Number(attrString(entries[0]?.attributes ?? {}, "userAccountControl") ?? UAC.NORMAL_ACCOUNT);
    if (updates.enabled !== undefined) uac = withAccountEnabled(uac, updates.enabled);
    if (updates.passwordNeverExpires !== undefined) {
      uac = updates.passwordNeverExpires ? uac | UAC.DONT_EXPIRE_PASSWORD : uac & ~UAC.DONT_EXPIRE_PASSWORD;
    }
    if (updates.smartcardRequired !== undefined) {
      uac = updates.smartcardRequired ? uac | UAC.SMARTCARD_REQUIRED : uac & ~UAC.SMARTCARD_REQUIRED;
    }
    changes.push(buildChange("replace", "userAccountControl", String(uac)));
  }

  if (updates.mustChangePasswordAtNextLogon !== undefined) {
    // pwdLastSet=0 forces a change at next logon; -1 is AD's sentinel for "set to now" (clears the flag).
    changes.push(buildChange("replace", "pwdLastSet", updates.mustChangePasswordAtNextLogon ? "0" : "-1"));
  }

  if (changes.length > 0) await modify(client, dn, changes);
}

export async function setUserEnabled(client: ldap.Client, dn: string, enabled: boolean): Promise<void> {
  const user = await getUser(client, dn);
  if (!user) throw new Error("User not found");
  const entries = await search(client, dn, { scope: "base", filter: "(objectClass=user)", attributes: ["userAccountControl"] });
  const currentUac = Number(attrString(entries[0]?.attributes ?? {}, "userAccountControl") ?? UAC.NORMAL_ACCOUNT);
  const newUac = withAccountEnabled(currentUac, enabled);
  await modify(client, dn, [buildChange("replace", "userAccountControl", String(newUac))]);
}

export async function resetUserPassword(client: ldap.Client, dn: string, newPassword: string): Promise<void> {
  await modify(client, dn, [buildChange("replace", "unicodePwd", encodeUnicodePwd(newPassword))]);
}

export async function deleteUser(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}
