import fs from "node:fs/promises";
import os from "node:os";
import { runCapture } from "../exec/safeExec.js";

/**
 * Shared plumbing for this app's DC-to-DC background sync loops (SYSVOL,
 * print server config) — both follow the same shape: the DC holding the PDC
 * emulator FSMO role is the single authoritative source, every other DC
 * periodically pulls a tar snapshot of a dedicated SMB share via its own
 * machine-account trust (no stored admin credential needed) and mirrors it
 * onto the local filesystem.
 */

// Same DN shape health.service.ts's parseFsmoShow already relies on:
// "CN=NTDS Settings,CN=<server>,CN=Servers,...".
function ownerServerName(dn: string): string {
  const match = dn.match(/CN=NTDS Settings,CN=([^,]+),CN=Servers/i);
  return match ? match[1] : dn;
}

/**
 * This DC's own (NetBIOS-style) server name, for comparison against
 * findPdcEmulator()'s result. `hostnamectl --static` can occasionally fail
 * outright (a D-Bus/systemd-hostnamed hiccup, confirmed live — it timed out
 * under host load) with empty stdout; naively trusting that would make a
 * DC's own hostname compare unequal to itself and misidentify as a replica
 * of itself. `os.hostname()` is a synchronous kernel syscall, not a D-Bus
 * call, so it can't fail the same way — used as the fallback (same pattern
 * provision.service.ts's own hostname detection already uses).
 */
export async function getMyDcName(): Promise<string> {
  const result = await runCapture("hostnamectl", ["--static"]);
  return result.stdout.trim() || os.hostname();
}

/** Finds the server (NetBIOS) name of the DC holding the PDC emulator FSMO role. */
export async function findPdcEmulator(): Promise<string | undefined> {
  const result = await runCapture("samba-tool", ["fsmo", "show"]);
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^PdcEmulationMasterRole owner: (.+)$/);
    if (match) return ownerServerName(match[1].trim());
  }
  return undefined;
}

/**
 * Recursively mirrors `src` into `dest`: copies new/changed files (by size
 * and mtime) and removes anything in `dest` that no longer exists in `src`
 * — the same end result as `rsync --delete`, using only Node's own fs
 * module (no external dependency).
 */
export async function mirrorDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  // `src` may legitimately not exist yet (e.g. no printer driver has ever
  // been uploaded on the source DC, so its printer-drivers/ directory was
  // never created) — treat that the same as "empty", not an error.
  const [srcEntries, destEntries] = await Promise.all([
    fs.readdir(src, { withFileTypes: true }).catch(() => []),
    fs.readdir(dest, { withFileTypes: true }).catch(() => []),
  ]);
  const srcNames = new Set(srcEntries.map((e) => e.name));

  for (const entry of destEntries) {
    if (!srcNames.has(entry.name)) {
      await fs.rm(`${dest}/${entry.name}`, { recursive: true, force: true });
    }
  }

  for (const entry of srcEntries) {
    const srcPath = `${src}/${entry.name}`;
    const destPath = `${dest}/${entry.name}`;
    if (entry.isDirectory()) {
      await mirrorDir(srcPath, destPath);
      continue;
    }
    const srcStat = await fs.stat(srcPath);
    const destStat = await fs.stat(destPath).catch(() => undefined);
    if (!destStat || destStat.size !== srcStat.size || destStat.mtimeMs < srcStat.mtimeMs) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Pulls a tar snapshot of `//<sourceFqdn>/<shareName>` into `destTarPath`,
 * authenticating as this DC's own computer account (`--machine-pass`) — no
 * stored admin password needed, since every domain-joined DC already has
 * one and the shares this is used against grant it read access by design.
 */
export async function pullShareTar(sourceFqdn: string, shareName: string, destTarPath: string): Promise<void> {
  const result = await runCapture("smbclient", [`//${sourceFqdn}/${shareName}`, "--machine-pass", "-Tc", destTarPath]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "smbclient exited with an error.");
  }
}

export async function extractTar(tarPath: string, extractDir: string): Promise<void> {
  await fs.mkdir(extractDir, { recursive: true });
  const result = await runCapture("tar", ["-xf", tarPath, "-C", extractDir]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "tar extraction failed.");
  }
}

/**
 * Starts a periodic tick that skips a firing entirely if the previous one
 * hasn't finished yet — critical for ticks whose duration can exceed the
 * interval. Confirmed live: `samba-tool ntacl sysvolreset` on a real SYSVOL
 * tree took longer than a naive 60s interval, and without this guard every
 * tick piled up another concurrent, never-finishing process (a real
 * incident this app caused on both test DCs before this guard existed).
 */
export function startGuardedInterval(fn: () => Promise<void>, intervalMs: number): void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    fn()
      .catch(() => {
        // Callers are expected to record their own failures (e.g. via a
        // status file) — this catch only guards against an unexpected
        // throw taking down the interval timer itself.
      })
      .finally(() => {
        running = false;
      });
  };
  tick();
  setInterval(tick, intervalMs);
}
