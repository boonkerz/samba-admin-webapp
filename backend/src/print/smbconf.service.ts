import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { runCapture } from "../exec/safeExec.js";

const SMB_CONF_PATH = "/etc/samba/smb.conf";
const SMB_CONF_BACKUP_PATH = "/etc/samba/smb.conf.pre-print-server.bak";
const SMB_CONF_NEW_PATH = "/etc/samba/smb.conf.new";

const DRIVER_STORE_DIRS = ["W32X86", "x64", "color", "WIN40", "IA64"];

const GLOBAL_KEYS: [string, string][] = [
  ["printing", "cups"],
  ["printcap name", "cups"],
  ["load printers", "yes"],
  // Samba's default (750s) means a newly created/enabled CUPS printer takes
  // up to ~12 minutes to appear as an SMB share — confirmed live. A low
  // value keeps this app's printer CRUD responsive; not a hack, several
  // real-world Samba+CUPS print-server guides recommend the same tuning.
  ["printcap cache time", "60"],
];

const PRINTERS_SECTION = `[printers]
	comment = All Printers
	path = /var/spool/samba
	browseable = no
	guest ok = no
	writable = no
	printable = yes
`;

const PRINT_DOLLAR_SECTION = `[print$]
	comment = Printer Drivers
	path = /var/lib/samba/printers
	browseable = yes
	guest ok = no
	read only = yes
	write list = @"Domain Admins" root
`;

function hasSection(content: string, name: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
  return new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "im").test(content);
}

function patchGlobalBlock(content: string): string {
  const globalMatch = content.match(/^\s*\[global\]\s*$/im);
  if (!globalMatch || globalMatch.index === undefined) {
    // No [global] section at all (shouldn't happen on a real DC, but don't
    // silently do nothing) — prepend a minimal one.
    return `[global]\n${GLOBAL_KEYS.map(([k, v]) => `\t${k} = ${v}`).join("\n")}\n\n${content}`;
  }

  const blockStart = globalMatch.index + globalMatch[0].length;
  const nextSectionMatch = content.slice(blockStart).match(/^\s*\[/m);
  const blockEnd = nextSectionMatch?.index !== undefined ? blockStart + nextSectionMatch.index : content.length;
  const block = content.slice(blockStart, blockEnd);

  const missing = GLOBAL_KEYS.filter(([key]) => !new RegExp(`^\\s*${key}\\s*=`, "im").test(block));
  if (missing.length === 0) return content;

  const insertion = missing.map(([key, value]) => `\t${key} = ${value}\n`).join("");
  return content.slice(0, blockStart) + "\n" + insertion + block.replace(/^\n/, "") + content.slice(blockEnd);
}

/** Ensures the SYSVOL-style driver store directory layout `net rpc printer driver` expects exists. */
function ensureDriverStoreDirs(): void {
  mkdirSync("/var/spool/samba", { recursive: true, mode: 0o1777 });
  for (const dir of DRIVER_STORE_DIRS) {
    mkdirSync(`/var/lib/samba/printers/${dir}`, { recursive: true });
  }
}

export interface SmbConfPatchResult {
  changed: boolean;
  reloadMethod?: "reload" | "restart";
}

/**
 * Idempotently adds the `[printers]`/`[print$]` shares and the `printing`/
 * `printcap name`/`load printers` globals to smb.conf, backs up the original
 * exactly once, validates via `testparm` before ever touching the live file,
 * and reloads (preferred) or restarts (verified fallback) smbd to pick up
 * the new shares. Never overwrites a key that's already present with any
 * value — only fills in what's missing.
 */
export async function ensurePrintSharesConfigured(log: (text: string) => void): Promise<SmbConfPatchResult> {
  const original = readFileSync(SMB_CONF_PATH, "utf8");

  // Global-key patching and section-adding are two independent idempotent
  // concerns — a box that already has [printers]/[print$] from a previous
  // run may still be missing a key added to GLOBAL_KEYS later (as happened
  // live: printcap cache time was added after the sections already existed).
  let patched = patchGlobalBlock(original);
  const missingSections = [
    hasSection(patched, "printers") ? undefined : PRINTERS_SECTION,
    hasSection(patched, "print$") ? undefined : PRINT_DOLLAR_SECTION,
  ].filter((s): s is string => s !== undefined);
  if (missingSections.length > 0) {
    patched = patched.trimEnd() + "\n\n" + missingSections.join("\n") + "\n";
  }

  ensureDriverStoreDirs();

  if (patched === original) {
    log("smb.conf already fully configured for print serving — skipping edit.");
    return { changed: false };
  }

  if (!existsSync(SMB_CONF_BACKUP_PATH)) {
    log(`Backing up smb.conf to ${SMB_CONF_BACKUP_PATH}...`);
    writeFileSync(SMB_CONF_BACKUP_PATH, original);
  }

  log("Writing patched smb.conf to a scratch file for validation...");
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

  const listShares = await runCapture("smbclient", ["-L", "//127.0.0.1", "-U%", "-m", "SMB3"]);
  if (/print\$/i.test(listShares.stdout)) {
    log("Reload picked up the new shares.");
    return { changed: true, reloadMethod: "reload" };
  }

  log("Soft reload did not pick up the new share; performing a full service restart (briefly interrupts active SMB/sysvol/netlogon connections)...");
  await runCapture("systemctl", ["restart", "samba-ad-dc"]);

  const listSharesAfterRestart = await runCapture("smbclient", ["-L", "//127.0.0.1", "-U%", "-m", "SMB3"]);
  if (!/print\$/i.test(listSharesAfterRestart.stdout)) {
    throw new Error("print$ share still not visible after a full samba-ad-dc restart — smb.conf may be malformed despite passing testparm.");
  }
  log("Restart picked up the new shares.");
  return { changed: true, reloadMethod: "restart" };
}

const SYNC_SHARE_NAME = "admin-webapp-sync";

const SYNC_SHARE_SECTION = `[${SYNC_SHARE_NAME}]
	comment = Samba Admin Webapp - inter-DC sync data (printer config, driver library)
	path = /var/lib/samba-admin-webapp
	browseable = no
	guest ok = no
	read only = yes
	valid users = @"Domain Controllers"
`;

/**
 * Idempotently adds a read-only share exposing this app's own data directory
 * to other domain controllers only (`@"Domain Controllers"` — the built-in
 * AD group every DC's computer account belongs to automatically). Used by
 * printSync.service.ts so a replica DC can pull the printer/driver library
 * via its own machine-account trust, the same dependency-free mechanism
 * sysvolSync.service.ts already uses against the built-in `[sysvol]` share —
 * this one just needs to exist first, since nothing else would otherwise
 * expose this app's own data directory over the network.
 */
export async function ensureSyncShareConfigured(): Promise<void> {
  const original = readFileSync(SMB_CONF_PATH, "utf8");
  if (hasSection(original, SYNC_SHARE_NAME)) return;

  const patched = original.trimEnd() + "\n\n" + SYNC_SHARE_SECTION;

  writeFileSync(SMB_CONF_NEW_PATH, patched);
  const check = await runCapture("testparm", ["-s", SMB_CONF_NEW_PATH]);
  if (check.exitCode !== 0 || /ERROR/i.test(check.stderr)) {
    rmSync(SMB_CONF_NEW_PATH, { force: true });
    throw new Error(`testparm rejected the patched smb.conf, aborting (original file untouched):\n${check.stdout}\n${check.stderr}`);
  }

  renameSync(SMB_CONF_NEW_PATH, SMB_CONF_PATH);
  await runCapture("smbcontrol", ["smbd", "reload-config"]);

  const listShares = await runCapture("smbclient", ["-L", "//127.0.0.1", "-U%", "-m", "SMB3"]);
  if (!new RegExp(SYNC_SHARE_NAME, "i").test(listShares.stdout)) {
    await runCapture("systemctl", ["restart", "samba-ad-dc"]);
  }
}

export function smbConfHasPrintShares(): boolean {
  try {
    const content = readFileSync(SMB_CONF_PATH, "utf8");
    return hasSection(content, "printers") && hasSection(content, "print$");
  } catch {
    return false;
  }
}
