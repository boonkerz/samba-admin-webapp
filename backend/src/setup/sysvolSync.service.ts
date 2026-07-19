import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SysvolSyncStatus } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";
import { config } from "../config.js";
import { getProvisionState, readProvisionSummary } from "../state/provisionState.js";
import { findPdcEmulator, getMyDcName, mirrorDir, pullShareTar, extractTar, startGuardedInterval } from "./dcSync.util.js";

/**
 * Samba has no built-in SYSVOL replication of its own (unlike Windows
 * FRS/DFSR) — administrators are normally expected to set up their own
 * rsync-based cron job between DCs (the solution documented on the Samba
 * wiki). This is the dependency-free, in-process equivalent: every DC that
 * doesn't hold the PDC emulator FSMO role periodically pulls a fresh copy of
 * SYSVOL from the one that does (single authoritative source avoids merge
 * conflicts), using only tools already required for the AD DC role itself —
 * `smbclient --machine-pass` (this DC's own computer account already has
 * domain-default read access to SYSVOL, no stored admin password needed)
 * and `tar` (part of the base OS, not a new dependency).
 */

const STATUS_PATH = path.join(config.dataDir, "sysvol-sync-status.json");
const SYNC_INTERVAL_MS = 60_000;
// `samba-tool ntacl sysvolreset` walks and resets ACLs on the whole SYSVOL
// tree — confirmed live to take well over a minute on a real dataset, far
// too slow to re-run on every sync tick. It only exists to re-establish a
// sane permission baseline after a plain-copy mirror (which doesn't
// preserve NTACL xattrs), so running it occasionally is enough.
const NTACL_RESET_INTERVAL_MS = 60 * 60_000;
// A single fixed work directory, wiped at the *start* of every tick, rather
// than a fresh mkdtemp() per tick cleaned up only in a `finally` block.
// Confirmed live: this app gets SIGKILLed mid-tick on every redeploy
// (`systemctl stop`), which skips `finally` entirely — 118 orphaned ~243MB
// per-tick directories accumulated this way over a day, filling a 30GB disk.
// Wiping this fixed path at the start of each run bounds worst-case leftover
// space to at most one tick's worth, no matter how the previous run died.
const WORK_DIR = path.join(os.tmpdir(), "samba-admin-sysvol-sync-work");

function readStatus(): SysvolSyncStatus {
  if (!existsSync(STATUS_PATH)) return { role: "unavailable" };
  try {
    return JSON.parse(readFileSync(STATUS_PATH, "utf8")) as SysvolSyncStatus;
  } catch {
    return { role: "unavailable" };
  }
}

function writeStatus(status: SysvolSyncStatus): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
}

export function getSysvolSyncStatus(): SysvolSyncStatus {
  return readStatus();
}

let lastNtaclResetAt = 0;

async function runSysvolSyncOnce(): Promise<void> {
  if ((await getProvisionState()) !== "provisioned") return;
  const summary = readProvisionSummary();
  if (!summary) return;

  const [myName, pdcName] = await Promise.all([getMyDcName(), findPdcEmulator()]);

  if (!pdcName) {
    writeStatus({ role: "unavailable", lastError: "Could not determine the PDC emulator's server name." });
    return;
  }

  if (myName.toUpperCase() === pdcName.toUpperCase()) {
    // We hold the PDC emulator role — we're the source, nothing to pull.
    writeStatus({ role: "source" });
    return;
  }

  const sourceFqdn = `${pdcName.toLowerCase()}.${summary.realm.toLowerCase()}`;
  const tarPath = path.join(WORK_DIR, "sysvol.tar");
  const extractDir = path.join(WORK_DIR, "extract");

  try {
    rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });
    await pullShareTar(sourceFqdn, "sysvol", tarPath);
    await extractTar(tarPath, extractDir);

    // The [sysvol] share's path is /var/lib/samba/sysvol itself (the parent
    // of every domain's own subfolder), so the pulled tar's own top level is
    // already "<domain>/Policies/", "<domain>/PolicyDefinitions/", etc.
    // (confirmed live) — mirror straight into the parent, not into a
    // domain-named subfolder, or this would double-nest it.
    await mirrorDir(extractDir, "/var/lib/samba/sysvol");

    // Plain fs.copyFile() doesn't preserve the source's NTACL extended
    // attributes, so freshly-mirrored files end up with whatever bare Unix
    // permissions the destination filesystem defaults to. Re-applying
    // samba-tool's own standard default ACL scheme re-establishes a sane
    // baseline without needing an ACL-preserving copy mechanism — but only
    // occasionally (see NTACL_RESET_INTERVAL_MS), never on every tick.
    if (Date.now() - lastNtaclResetAt > NTACL_RESET_INTERVAL_MS) {
      await runCapture("samba-tool", ["ntacl", "sysvolreset"]);
      lastNtaclResetAt = Date.now();
    }

    writeStatus({ role: "replica", sourceDc: pdcName, lastSyncAt: new Date().toISOString(), lastSyncOk: true });
  } catch (err) {
    writeStatus({
      role: "replica",
      sourceDc: pdcName,
      lastSyncAt: new Date().toISOString(),
      lastSyncOk: false,
      lastError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    rmSync(WORK_DIR, { recursive: true, force: true });
  }
}

let started = false;

/** Starts the periodic background sync loop; safe to call multiple times (only the first call has any effect). */
export function startSysvolSyncLoop(): void {
  if (started) return;
  started = true;
  startGuardedInterval(runSysvolSyncOnce, SYNC_INTERVAL_MS);
}
