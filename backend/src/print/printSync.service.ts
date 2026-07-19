import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrintSyncStatus } from "@samba-admin/shared";
import { config } from "../config.js";
import { getProvisionState, readProvisionSummary } from "../state/provisionState.js";
import { findPdcEmulator, getMyDcName, mirrorDir, pullShareTar, extractTar, startGuardedInterval } from "../setup/dcSync.util.js";
import { ensureSyncShareConfigured } from "./smbconf.service.js";
import { getPrintServerStatus } from "./print-server-enable.service.js";
import { listPrinters, createPrinter, updatePrinter, deletePrinter, setDefaultPrinter, setPrinterEnabled } from "./cups.service.js";

/**
 * Mirrors printer queue definitions and the uploaded Windows driver library
 * between DCs — the failover-readiness half of "make the replica actually
 * useful if the primary goes down" (see sysvolSync.service.ts for the SYSVOL
 * half). Same architecture: the PDC emulator is the single authoritative
 * source, every other DC pulls from it via its own machine-account trust.
 *
 * Deliberately out of scope: actually *registering* a Windows driver in
 * Samba's print$ store on the replica (`rpcclient adddriver`/`setdriver`)
 * needs real domain admin rights this app never persists to disk — an
 * admin does that once per printer per replica, the normal "Treiber
 * zuweisen" action, using their own logged-in session credentials.
 */

const EXPORT_PATH = path.join(config.dataDir, "print-sync-export.json");
const STATUS_PATH = path.join(config.dataDir, "print-sync-status.json");
const DRIVERS_SUBDIR = "printer-drivers";
const SYNC_INTERVAL_MS = 60_000;
// Fixed work directory, wiped at the *start* of every tick rather than
// relying solely on a `finally`-block cleanup — see sysvolSync.service.ts
// for why: this app gets SIGKILLed mid-tick on every redeploy, which skips
// `finally` entirely and orphans a fresh mkdtemp() directory forever.
const WORK_DIR = path.join(os.tmpdir(), "samba-admin-print-sync-work");

interface PrintSyncExport {
  printers: Awaited<ReturnType<typeof listPrinters>>;
}

function readStatus(): PrintSyncStatus {
  if (!existsSync(STATUS_PATH)) return { role: "unavailable" };
  try {
    return JSON.parse(readFileSync(STATUS_PATH, "utf8")) as PrintSyncStatus;
  } catch {
    return { role: "unavailable" };
  }
}

function writeStatus(status: PrintSyncStatus): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
}

export function getPrintSyncStatus(): PrintSyncStatus {
  return readStatus();
}

/** Keeps this DC's own current printer list published, whether or not it's currently the source — so whichever DC holds the PDC emulator role always has an up to date export ready to be pulled. */
async function publishExport(): Promise<void> {
  const status = await getPrintServerStatus();
  if (!status.ready) return;
  const printers = await listPrinters();
  const exportData: PrintSyncExport = { printers };
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(EXPORT_PATH, JSON.stringify(exportData, null, 2));
}

async function reconcileLocalPrinters(exportData: PrintSyncExport): Promise<void> {
  const status = await getPrintServerStatus();
  if (!status.ready) return; // nothing to reconcile onto until this DC's own print server role is set up

  const local = await listPrinters();
  const localByName = new Map(local.map((p) => [p.name, p]));
  const remoteNames = new Set(exportData.printers.map((p) => p.name));

  for (const remote of exportData.printers) {
    const existing = localByName.get(remote.name);
    if (!existing) {
      await createPrinter({
        name: remote.name,
        deviceUri: remote.deviceUri,
        location: remote.location,
        comment: remote.comment,
        shared: remote.shared,
      });
    } else if (
      existing.deviceUri !== remote.deviceUri ||
      existing.location !== remote.location ||
      existing.comment !== remote.comment ||
      existing.shared !== remote.shared
    ) {
      await updatePrinter(remote.name, {
        deviceUri: remote.deviceUri,
        location: remote.location,
        comment: remote.comment,
        shared: remote.shared,
      });
    }
    if (remote.isDefault) await setDefaultPrinter(remote.name);
    if (existing && existing.accepting !== remote.accepting) await setPrinterEnabled(remote.name, remote.accepting);
  }

  // Full mirror, same philosophy as sysvolSync: a queue removed on the
  // source disappears from every replica too.
  for (const name of localByName.keys()) {
    if (!remoteNames.has(name)) await deletePrinter(name);
  }
}

async function runPrintSyncOnce(): Promise<void> {
  if ((await getProvisionState()) !== "provisioned") return;
  const summary = readProvisionSummary();
  if (!summary) return;

  await ensureSyncShareConfigured().catch(() => {
    // Best-effort — if this fails (e.g. transient testparm issue), the tick
    // just retries on the next interval instead of taking the whole loop down.
  });
  await publishExport().catch(() => {});

  const [myName, pdcName] = await Promise.all([getMyDcName(), findPdcEmulator()]);

  if (!pdcName) {
    writeStatus({ role: "unavailable", lastError: "Could not determine the PDC emulator's server name." });
    return;
  }

  if (myName.toUpperCase() === pdcName.toUpperCase()) {
    writeStatus({ role: "source" });
    return;
  }

  const sourceFqdn = `${pdcName.toLowerCase()}.${summary.realm.toLowerCase()}`;
  const tarPath = path.join(WORK_DIR, "sync.tar");
  const extractDir = path.join(WORK_DIR, "extract");

  try {
    rmSync(WORK_DIR, { recursive: true, force: true });
    mkdirSync(WORK_DIR, { recursive: true });
    await pullShareTar(sourceFqdn, "admin-webapp-sync", tarPath);
    await extractTar(tarPath, extractDir);

    // Only mirror the specific print-related paths, never the whole pulled
    // tree — the share exposes this app's whole data directory for
    // simplicity, but it also contains purely local, per-DC facts (this
    // DC's own provisioning marker, its own sysvol/print sync status files)
    // that must never be overwritten by the source's copy of the same
    // filename.
    await mirrorDir(path.join(extractDir, DRIVERS_SUBDIR), path.join(config.dataDir, DRIVERS_SUBDIR));
    for (const file of ["printer-drivers.json", "printer-driver-associations.json", "print-sync-export.json"]) {
      const srcFile = path.join(extractDir, file);
      if (existsSync(srcFile)) {
        writeFileSync(path.join(config.dataDir, file), readFileSync(srcFile));
      }
    }

    const exportData = JSON.parse(readFileSync(path.join(extractDir, "print-sync-export.json"), "utf8")) as PrintSyncExport;
    await reconcileLocalPrinters(exportData);

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
export function startPrintSyncLoop(): void {
  if (started) return;
  started = true;
  startGuardedInterval(runPrintSyncOnce, SYNC_INTERVAL_MS);
}
