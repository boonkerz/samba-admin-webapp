import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { CreateFileShareRequest, FileShareSummary, FileShareValidationResult, UpdateFileShareRequest } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";

/**
 * General-purpose SMB file shares ("Shared Folders" equivalent) — a
 * generalization of the idempotent smb.conf-patching pattern
 * print/smbconf.service.ts established for print shares: back up once,
 * validate with `testparm` against a scratch file before ever touching the
 * live config, atomically rename over it, then reload (falling back to a
 * full restart, verified) so smbd picks up the change.
 */

const SMB_CONF_PATH = "/etc/samba/smb.conf";
const SMB_CONF_BACKUP_PATH = "/etc/samba/smb.conf.pre-fileshares.bak";
const SMB_CONF_NEW_PATH = "/etc/samba/smb.conf.new";

// Case-insensitive — these are either special Samba sections (`global`,
// `homes`), sections other features of this app already own (`printers`,
// `print$`, `admin-webapp-sync`), or the built-in AD DC shares (`sysvol`,
// `netlogon`) that must never be edited/removed through this feature.
const RESERVED_SHARE_NAMES = new Set(["global", "homes", "printers", "print$", "sysvol", "netlogon", "admin-webapp-sync", "ipc$"]);

// Paths whose sharing would either break this app or the DC itself if a typo
// pointed a new share at them. Not an attempt at a general path sandbox —
// the admin running this tool already has full root access to the box.
const DISALLOWED_PATHS = new Set(["/", "/etc", "/etc/samba", "/var/lib/samba", "/var/lib/samba-admin-webapp"]);

const SHARE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/;

export function validateFileShareParams(params: CreateFileShareRequest): FileShareValidationResult {
  const errors: FileShareValidationResult["errors"] = {};
  if (!SHARE_NAME_RE.test(params.name)) {
    errors.name = "Share name must be 1-80 letters/digits/spaces/._- , starting with a letter or digit.";
  } else if (RESERVED_SHARE_NAMES.has(params.name.toLowerCase())) {
    errors.name = "This share name is reserved.";
  }
  if (!params.path.startsWith("/")) {
    errors.path = "Path must be an absolute filesystem path.";
  } else if (DISALLOWED_PATHS.has(params.path.replace(/\/+$/, "") || "/")) {
    errors.path = "This path cannot be shared.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// Share names can contain regex metacharacters (`.`, `$`, ...) that must be
// matched literally wherever a name gets embedded into a RegExp.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasSection(content: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im").test(content);
}

/** Extracts the raw text of a `[name]` section (up to but excluding the next `[section]` header). */
function extractSection(content: string, name: string): string | undefined {
  const escaped = escapeRegExp(name);
  const match = content.match(new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im"));
  if (!match || match.index === undefined) return undefined;
  const start = match.index + match[0].length;
  const nextSectionMatch = content.slice(start).match(/^\s*\[/m);
  const end = nextSectionMatch?.index !== undefined ? start + nextSectionMatch.index : content.length;
  return content.slice(start, end);
}

function sectionValue(section: string, key: string): string | undefined {
  const match = section.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "im"));
  return match?.[1]?.trim();
}

function removeSection(content: string, name: string): string {
  const escaped = escapeRegExp(name);
  const match = content.match(new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im"));
  if (!match || match.index === undefined) return content;
  const start = match.index;
  const afterHeader = start + match[0].length;
  const nextSectionMatch = content.slice(afterHeader).match(/^\s*\[/m);
  const end = nextSectionMatch?.index !== undefined ? afterHeader + nextSectionMatch.index : content.length;
  return content.slice(0, start) + content.slice(end);
}

function buildSection(name: string, params: { path: string; comment?: string; browseable?: boolean; readOnly?: boolean }): string {
  const lines = [
    `[${name}]`,
    `\tpath = ${params.path}`,
    `\tcomment = ${params.comment ?? ""}`,
    `\tbrowseable = ${params.browseable === false ? "no" : "yes"}`,
    `\tread only = ${params.readOnly ? "yes" : "no"}`,
    `\tguest ok = no`,
    "",
  ];
  return lines.join("\n");
}

/** Lists all non-reserved `[name]` sections in smb.conf as file shares. */
export function listFileShares(): FileShareSummary[] {
  let content: string;
  try {
    content = readFileSync(SMB_CONF_PATH, "utf8");
  } catch {
    return [];
  }

  const names: string[] = [];
  const sectionRe = /^\s*\[([^\]]+)\]\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(content)) !== null) {
    if (!RESERVED_SHARE_NAMES.has(m[1].toLowerCase())) names.push(m[1]);
  }

  return names.map((name) => {
    const section = extractSection(content, name) ?? "";
    return {
      name,
      path: sectionValue(section, "path") ?? "",
      comment: sectionValue(section, "comment") || undefined,
      browseable: sectionValue(section, "browseable")?.toLowerCase() !== "no",
      readOnly: sectionValue(section, "read only")?.toLowerCase() === "yes",
    };
  });
}

export function getFileShare(name: string): FileShareSummary | undefined {
  return listFileShares().find((s) => s.name === name);
}

async function applySmbConf(patched: string, original: string, log: (text: string) => void, expectedShareName: string, expectPresent: boolean): Promise<void> {
  if (!existsSync(SMB_CONF_BACKUP_PATH)) {
    log(`Backing up smb.conf to ${SMB_CONF_BACKUP_PATH}...`);
    writeFileSync(SMB_CONF_BACKUP_PATH, original);
  }

  writeFileSync(SMB_CONF_NEW_PATH, patched);
  const check = await runCapture("testparm", ["-s", SMB_CONF_NEW_PATH]);
  if (check.exitCode !== 0 || /ERROR/i.test(check.stderr)) {
    rmSync(SMB_CONF_NEW_PATH, { force: true });
    throw new Error(`testparm rejected the patched smb.conf, aborting (original file untouched):\n${check.stdout}\n${check.stderr}`);
  }
  log("testparm validated the patched configuration.");

  renameSync(SMB_CONF_NEW_PATH, SMB_CONF_PATH);
  log("smb.conf updated.");

  log("Reloading smbd configuration (smbcontrol)...");
  await runCapture("smbcontrol", ["smbd", "reload-config"]);

  // smbclient -L output is a tabular "sharename  Type  Comment" listing, not
  // one name per line — a substring/word-boundary check (matching the
  // approach smbconf.service.ts uses for print$) is what actually works here.
  const isPresent = async () =>
    new RegExp(`\\b${escapeRegExp(expectedShareName)}\\b`, "im").test(
      (await runCapture("smbclient", ["-L", "//127.0.0.1", "-U%", "-m", "SMB3"])).stdout
    );

  if ((await isPresent()) === expectPresent) {
    log("Reload picked up the change.");
    return;
  }

  log("Soft reload did not pick up the change; performing a full service restart (briefly interrupts active SMB connections)...");
  await runCapture("systemctl", ["restart", "samba-ad-dc"]);

  if ((await isPresent()) !== expectPresent) {
    throw new Error(`Share "${expectedShareName}" still not in the expected state after a full samba-ad-dc restart.`);
  }
  log("Restart picked up the change.");
}

export async function createFileShare(params: CreateFileShareRequest, log: (text: string) => void): Promise<void> {
  const original = readFileSync(SMB_CONF_PATH, "utf8");
  if (hasSection(original, params.name)) {
    throw new Error(`A share named "${params.name}" already exists.`);
  }

  log(`Ensuring directory ${params.path} exists...`);
  mkdirSync(params.path, { recursive: true });

  const patched = original.trimEnd() + "\n\n" + buildSection(params.name, params);
  await applySmbConf(patched, original, log, params.name, true);
}

export async function updateFileShare(name: string, params: UpdateFileShareRequest, log: (text: string) => void): Promise<void> {
  const original = readFileSync(SMB_CONF_PATH, "utf8");
  if (!hasSection(original, name)) {
    throw new Error(`No share named "${name}" exists.`);
  }
  const existingSection = extractSection(original, name) ?? "";
  const merged = {
    path: params.path ?? sectionValue(existingSection, "path") ?? "",
    comment: params.comment !== undefined ? params.comment : sectionValue(existingSection, "comment"),
    browseable: params.browseable !== undefined ? params.browseable : sectionValue(existingSection, "browseable")?.toLowerCase() !== "no",
    readOnly: params.readOnly !== undefined ? params.readOnly : sectionValue(existingSection, "read only")?.toLowerCase() === "yes",
  };

  if (merged.path !== sectionValue(existingSection, "path")) {
    log(`Ensuring directory ${merged.path} exists...`);
    mkdirSync(merged.path, { recursive: true });
  }

  const withoutOld = removeSection(original, name);
  const patched = withoutOld.trimEnd() + "\n\n" + buildSection(name, merged);
  await applySmbConf(patched, original, log, name, true);
}

/** Removes the share definition from smb.conf. Does NOT delete the underlying directory or its files. */
export async function deleteFileShare(name: string, log: (text: string) => void): Promise<void> {
  const original = readFileSync(SMB_CONF_PATH, "utf8");
  if (!hasSection(original, name)) return;

  const patched = removeSection(original, name);
  await applySmbConf(patched, original, log, name, false);
}
