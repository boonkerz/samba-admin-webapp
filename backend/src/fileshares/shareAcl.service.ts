import type { ShareAccessMask, ShareAce } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";

/**
 * Share-level permissions (Windows' "Share Permissions" tab) via Samba's
 * `sharesec` tool. Verified live against a real DC: `sharesec <share> -v`
 * lists lines like `ACL:S-1-1-0:ALLOWED/0x0/FULL`; `-a` adds an ACE from the
 * same `trustee:type/flags/mask` format (see `man sharesec`'s ACL FORMAT
 * section). Flags are always 0 for share ACLs per that same manual.
 *
 * `sharesec` cannot resolve trustee names to SIDs itself — confirmed live it
 * fails with "failed to convert '<name>' to SID" even for a name `wbinfo`/
 * `getent` resolve without issue. This app resolves names to/from SIDs
 * itself via `wbinfo` before ever calling `sharesec`, rather than depending
 * on a resolution path that doesn't actually work.
 */

const ACE_LINE_RE = /^ACL:(.+):(ALLOWED|DENIED)\/([^/]*)\/(.+)$/;
const KNOWN_MASKS = new Set<ShareAccessMask>(["FULL", "CHANGE", "READ"]);
const SID_RE = /^S-\d+(-\d+)+$/i;

// Well-known security principals have no AD object `wbinfo -n` can look up
// (confirmed live: it fails with WBC_ERR_NOT_MAPPED for "Everyone" and
// "Authenticated Users") — checked by name (any common spelling, case-
// insensitive) before falling back to wbinfo for real domain accounts.
const WELL_KNOWN_NAME_TO_SID: Record<string, string> = {
  everyone: "S-1-1-0",
  jeder: "S-1-1-0",
  "authenticated users": "S-1-5-11",
  "nt authority\\authenticated users": "S-1-5-11",
  "authentifizierte benutzer": "S-1-5-11",
};

function parseMask(raw: string): ShareAccessMask {
  const upper = raw.trim().toUpperCase();
  if (KNOWN_MASKS.has(upper as ShareAccessMask)) return upper as ShareAccessMask;
  // sharesec can in principle report a raw numeric mask instead of one of its
  // own named combined permissions (e.g. if the ACL was set by something
  // other than this app) — fall back to the most conservative reading
  // rather than guessing or crashing.
  return "READ";
}

/** SID -> "DOMAIN\name" (or "\name" for a well-known SID with no domain) via `wbinfo -s`, falling back to the SID itself if unresolvable. */
async function sidToName(sid: string): Promise<string> {
  const result = await runCapture("wbinfo", ["-s", sid]);
  if (result.exitCode !== 0) return sid;
  const name = result.stdout.trim().split(/\s+/)[0];
  return name ? name.replace(/^\\/, "") : sid;
}

/** Name (or an already-given SID) -> SID via `wbinfo -n`. Throws with a clear message if the trustee can't be resolved at all. */
async function nameToSid(trustee: string): Promise<string> {
  if (SID_RE.test(trustee)) return trustee;
  const wellKnown = WELL_KNOWN_NAME_TO_SID[trustee.trim().toLowerCase()];
  if (wellKnown) return wellKnown;
  const result = await runCapture("wbinfo", ["-n", trustee]);
  if (result.exitCode !== 0) {
    throw new Error(`Could not resolve "${trustee}" to a user or group on this domain.`);
  }
  const sid = result.stdout.trim().split(/\s+/)[0];
  if (!SID_RE.test(sid)) {
    throw new Error(`Could not resolve "${trustee}" to a user or group on this domain.`);
  }
  return sid;
}

export async function getShareAcl(shareName: string): Promise<ShareAce[]> {
  const result = await runCapture("sharesec", [shareName, "-v"]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read share permissions for "${shareName}": ${result.stderr || result.stdout}`);
  }
  const aces: ShareAce[] = [];
  for (const line of result.stdout.split("\n")) {
    const match = ACE_LINE_RE.exec(line.trim());
    if (!match) continue;
    aces.push({ trustee: await sidToName(match[1]), type: match[2] as "ALLOWED" | "DENIED", mask: parseMask(match[4]) });
  }
  return aces;
}

export async function setShareAcl(shareName: string, aces: ShareAce[]): Promise<void> {
  if (aces.length === 0) {
    throw new Error("A share must have at least one permission entry.");
  }
  // `-R` (replace) is the only flag that actually replaces the whole ACL —
  // confirmed live that `-D` (delete security descriptor) followed by `-a`
  // (add) per-entry re-synthesizes Samba's built-in default Everyone:FULL
  // entry on the first `-a` call, making it impossible to ever produce a
  // list that omits Everyone. `-R` with the complete desired list has no
  // such problem.
  const sids = await Promise.all(aces.map((ace) => nameToSid(ace.trustee)));
  const spec = aces.map((ace, i) => `${sids[i]}:${ace.type}/0/${ace.mask}`).join(",");
  const result = await runCapture("sharesec", [shareName, "-R", spec]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to set share permissions for "${shareName}": ${result.stderr || result.stdout}`);
  }
}
