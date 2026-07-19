import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import type { BackupFileInfo } from "@samba-admin/shared";
import { startExecutorJob, type JobContext } from "../jobs/jobRunner.js";
import { config } from "../config.js";
import { readProvisionSummary } from "../state/provisionState.js";
import { getMyDcName } from "./dcSync.util.js";

/**
 * Full domain backup (`samba-tool domain backup online`) — a disaster-
 * recovery snapshot of the whole directory database (including secrets),
 * suitable for `samba-tool domain backup restore` on a fresh server (see
 * restore.service.ts). Unlike the DC-to-DC sync loops, this is a manual,
 * one-off admin action, so it authenticates as the logged-in admin (full
 * NTACL fidelity) rather than via machine-pass (confirmed live: machine-pass
 * backups emit "Failed to get the ntacl" warnings for GPO files).
 */

const BACKUPS_DIR = path.join(config.dataDir, "backups");

export function listBackups(): BackupFileInfo[] {
  if (!existsSync(BACKUPS_DIR)) return [];
  return readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".tar.bz2"))
    .map((filename) => {
      const stat = statSync(path.join(BACKUPS_DIR, filename));
      return { filename, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** `path.basename()` strips any directory traversal attempt from a user-supplied filename before it ever touches the filesystem. */
export function getBackupFilePath(filename: string): string {
  return path.join(BACKUPS_DIR, path.basename(filename));
}

export function deleteBackup(filename: string): void {
  const filePath = getBackupFilePath(filename);
  if (existsSync(filePath)) rmSync(filePath, { force: true });
}

async function runBackupSteps(ctx: JobContext, username: string, password: string): Promise<void> {
  mkdirSync(BACKUPS_DIR, { recursive: true });
  const summary = readProvisionSummary();
  if (!summary) {
    throw new Error("This server is not provisioned.");
  }
  // `hostname -f` returns whatever FQDN this box's general network DNS
  // assigns (confirmed live: a FRITZ!Box-issued "samba.fritz.box", not part
  // of the AD domain's own DNS zone) — samba-tool's --server= needs a name
  // resolvable within the *domain's* own site topology, or its CLDAP-based
  // find_dc_site() lookup fails with "The object was not found." Building
  // the FQDN from this DC's own name + the domain realm (the same pattern
  // sysvolSync/printSync/join already rely on) is what actually works.
  const myName = await getMyDcName();
  const fqdn = `${myName.toLowerCase()}.${summary.realm.toLowerCase()}`;

  ctx.log(`Creating a full domain backup of ${fqdn}...`);
  const exitCode = await ctx.runStreamed(
    "samba-tool",
    ["domain", "backup", "online", `--server=${fqdn}`, `--targetdir=${BACKUPS_DIR}`, `-U${username}%${password}`],
    [password]
  );
  if (exitCode !== 0) {
    throw new Error(`samba-tool domain backup online exited with code ${exitCode}`);
  }
  ctx.log("Backup created.");
}

export function startBackupJob(username: string, password: string): string {
  return startExecutorJob("domain-backup", (ctx) => runBackupSteps(ctx, username, password), { redact: [password] });
}
