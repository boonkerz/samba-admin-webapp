export function realmToBaseDn(realm: string): string {
  return realm
    .toLowerCase()
    .split(".")
    .map((label) => `DC=${label}`)
    .join(",");
}

export function baseDnToDnsName(baseDn: string): string {
  return baseDn
    .split(",")
    .filter((part) => part.startsWith("DC="))
    .map((part) => part.slice(3))
    .join(".");
}

/** Escapes a value for safe interpolation into an LDAP search filter (RFC 4515). */
export function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (char) => {
    const code = char.charCodeAt(0).toString(16).padStart(2, "0");
    return `\\${code}`;
  });
}

/** userAccountControl bit flags relevant to this app. */
export const UAC = {
  ACCOUNTDISABLE: 0x0002,
  NORMAL_ACCOUNT: 0x0200,
  DONT_EXPIRE_PASSWORD: 0x10000,
  WORKSTATION_TRUST_ACCOUNT: 0x1000,
  SMARTCARD_REQUIRED: 0x40000,
};

export function isAccountEnabled(userAccountControl: number): boolean {
  return (userAccountControl & UAC.ACCOUNTDISABLE) === 0;
}

export function withAccountEnabled(userAccountControl: number, enabled: boolean): number {
  return enabled ? userAccountControl & ~UAC.ACCOUNTDISABLE : userAccountControl | UAC.ACCOUNTDISABLE;
}

/** Converts a binary objectGUID (as returned by ldapjs) to the standard hyphenated string form. */
export function guidBufferToString(buf: Buffer): string {
  const b = buf;
  const hex = (start: number, end: number) =>
    Array.from(b.subarray(start, end))
      .reverse()
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  return [
    hex(0, 4),
    hex(4, 6),
    hex(6, 8),
    Array.from(b.subarray(8, 10)).map((x) => x.toString(16).padStart(2, "0")).join(""),
    Array.from(b.subarray(10, 16)).map((x) => x.toString(16).padStart(2, "0")).join(""),
  ].join("-");
}

/** Converts a binary objectSid (as returned by ldapjs) to the standard S-1-5-... string form. */
export function sidBufferToString(buf: Buffer): string {
  const revision = buf.readUInt8(0);
  const subAuthorityCount = buf.readUInt8(1);
  const authority = buf.readUIntBE(2, 6);
  let sid = `S-${revision}-${authority}`;
  for (let i = 0; i < subAuthorityCount; i++) {
    sid += `-${buf.readUInt32LE(8 + i * 4)}`;
  }
  return sid;
}

/** UTF-16LE, quoted encoding Samba/AD requires for the unicodePwd attribute. */
export function encodeUnicodePwd(password: string): Buffer {
  return Buffer.from(`"${password}"`, "utf16le");
}

const FILETIME_EPOCH_DIFF_SECONDS = 11644473600n;
const FILETIME_TICKS_PER_SECOND = 10000000n;
const FILETIME_NEVER = 9223372036854775807n;

/** Converts AD's accountExpires (100ns ticks since 1601-01-01) to an ISO date, or undefined if the account never expires. */
export function fileTimeToIsoDate(fileTime: string | undefined): string | undefined {
  if (!fileTime) return undefined;
  const ticks = BigInt(fileTime);
  if (ticks === 0n || ticks === FILETIME_NEVER) return undefined;
  const unixSeconds = ticks / FILETIME_TICKS_PER_SECOND - FILETIME_EPOCH_DIFF_SECONDS;
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

/** Converts an ISO date (or undefined/null for "never expires") to AD's accountExpires FILETIME string. */
export function isoDateToFileTime(isoDate: string | undefined | null): string {
  if (!isoDate) return "0";
  const unixSeconds = BigInt(Math.floor(new Date(isoDate).getTime() / 1000));
  return ((unixSeconds + FILETIME_EPOCH_DIFF_SECONDS) * FILETIME_TICKS_PER_SECOND).toString();
}

/**
 * AD interval attributes (e.g. lockoutDuration, msDS-MinimumPasswordAge) store a *negative* count of
 * 100ns ticks representing a duration — distinct from the absolute FILETIME timestamps above.
 */
export function daysToNegativeInterval(days: number): string {
  return String(-BigInt(Math.round(days * 86400)) * FILETIME_TICKS_PER_SECOND);
}

export function negativeIntervalToDays(value: string | undefined): number {
  if (!value) return 0;
  return Math.round(Number(-BigInt(value) / FILETIME_TICKS_PER_SECOND) / 86400);
}

export function minutesToNegativeInterval(minutes: number): string {
  return String(-BigInt(Math.round(minutes * 60)) * FILETIME_TICKS_PER_SECOND);
}

export function negativeIntervalToMinutes(value: string | undefined): number {
  if (!value) return 0;
  return Math.round(Number(-BigInt(value) / FILETIME_TICKS_PER_SECOND) / 60);
}
