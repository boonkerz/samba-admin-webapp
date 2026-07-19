import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RestoreParams, RestoreValidationResult, SetupSummary } from "@samba-admin/shared";
import { startExecutorJob, type JobContext } from "../jobs/jobRunner.js";
import { writeProvisionMarker } from "../state/provisionState.js";
import { config } from "../config.js";
import { getForwarders } from "../dns/dns-forwarders.service.js";
import { detectPrimaryIp } from "./provision.service.js";

/**
 * "Restore from backup" — a third setup-wizard mode alongside creating a new
 * forest or joining an existing domain, standing up a fresh DC directly from
 * a `samba-tool domain backup online` file (see backup.service.ts). This is
 * the disaster-recovery path: rebuilding a domain after total loss, from the
 * last known-good backup.
 */

// Same NetBIOS-length limit as provision.service.ts's NETBIOS_RE — confirmed
// live that samba-tool silently truncates a longer --newservername to 15
// chars rather than rejecting it, which would otherwise produce a server
// whose actual name doesn't match what the admin thinks they set.
const SERVER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,14}$/;

export function validateRestoreParams(params: RestoreParams): RestoreValidationResult {
  const errors: RestoreValidationResult["errors"] = {};
  if (!SERVER_NAME_RE.test(params.newServerName)) {
    errors.newServerName = "Server name must be 1-15 letters/digits/hyphens (NetBIOS limit), no dots.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Rewrites the smb.conf `samba-tool domain backup restore` generates inside
 * the staging directory: it hardcodes every path to that staging directory
 * (confirmed live), which the real, already-provisioned box's smb.conf never
 * does — it relies on Samba's compiled-in defaults instead. Dropping these
 * override lines entirely and repointing the sysvol/netlogon share paths at
 * the real system location produces the same shape smb.conf a normal
 * provision would.
 */
function rewriteRestoredSmbConf(content: string, stagingDir: string): string {
  const withoutOverrides = content.replace(
    /^[ \t]*(binddns dir|cache directory|lock directory|private dir|state directory)[ \t]*=.*$\n?/gim,
    ""
  );
  return withoutOverrides.split(path.join(stagingDir, "state", "sysvol")).join("/var/lib/samba/sysvol");
}

async function runRestoreSteps(ctx: JobContext, backupFilePath: string, params: RestoreParams): Promise<SetupSummary> {
  const hostname = (await ctx.runQuick("hostnamectl", ["--static"])).stdout.trim() || os.hostname();
  const ip = params.hostIp?.trim() || detectPrimaryIp();

  // Same retry-safety cleanup as provision/join — samba-tool refuses to
  // write into a live smb.conf/private/sysvol that already has data.
  if (existsSync("/etc/samba/smb.conf")) {
    if (existsSync("/etc/samba/smb.conf.pre-provision.bak")) {
      ctx.log("Removing smb.conf left over from a previous failed attempt...");
      rmSync("/etc/samba/smb.conf", { force: true });
    } else {
      ctx.log("Moving aside existing /etc/samba/smb.conf (samba-tool refuses to overwrite it)...");
      renameSync("/etc/samba/smb.conf", "/etc/samba/smb.conf.pre-provision.bak");
    }
  }
  for (const dir of ["private", "sysvol", "bind-dns"]) {
    rmSync(`/var/lib/samba/${dir}`, { recursive: true, force: true });
  }

  // Staged under this app's own data dir (not os.tmpdir()) specifically so
  // it's on the same filesystem as /var/lib/samba — moving the restored
  // private/sysvol directories into place is a plain rename, not a
  // cross-device copy.
  const stagingBase = path.join(config.dataDir, "restore-staging");
  mkdirSync(stagingBase, { recursive: true });
  const stagingDir = mkdtempSync(path.join(stagingBase, "restore-"));

  try {
    ctx.log("Restoring domain database from backup...");
    const exitCode = await ctx.runStreamed("samba-tool", [
      "domain",
      "backup",
      "restore",
      `--backup-file=${backupFilePath}`,
      `--targetdir=${stagingDir}`,
      `--newservername=${params.newServerName}`,
      `--host-ip=${ip}`,
    ]);
    if (exitCode !== 0) {
      throw new Error(`samba-tool domain backup restore exited with code ${exitCode}`);
    }

    ctx.log("Rewriting configuration paths and moving restored data into place...");
    const smbConf = rewriteRestoredSmbConf(readFileSync(path.join(stagingDir, "etc", "smb.conf"), "utf8"), stagingDir);

    renameSync(path.join(stagingDir, "private"), "/var/lib/samba/private");
    renameSync(path.join(stagingDir, "state", "sysvol"), "/var/lib/samba/sysvol");
    if (existsSync(path.join(stagingDir, "bind-dns"))) {
      renameSync(path.join(stagingDir, "bind-dns"), "/var/lib/samba/bind-dns");
    } else {
      mkdirSync("/var/lib/samba/bind-dns", { recursive: true });
    }
    writeFileSync("/etc/samba/smb.conf", smbConf);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }

  // From here on, mirrors provision.service.ts's / join.service.ts's post-steps.
  ctx.log("Adding a startup guard so samba-ad-dc waits for a real IP before starting...");
  mkdirSync("/etc/systemd/system/samba-ad-dc.service.d", { recursive: true });
  const waitForIpScriptPath = path.join(config.configDir, "wait-for-ip.sh");
  mkdirSync(config.configDir, { recursive: true });
  writeFileSync(
    waitForIpScriptPath,
    `#!/bin/sh\nfor i in $(seq 1 30); do\n  ip -4 addr show scope global | grep -q "inet " && exit 0\n  sleep 1\ndone\necho "Warning: no IPv4 address after 30s, starting anyway" >&2\nexit 0\n`,
    { mode: 0o755 }
  );
  writeFileSync("/etc/systemd/system/samba-ad-dc.service.d/override.conf", `[Service]\nExecStartPre=${waitForIpScriptPath}\n`);
  await ctx.runQuick("systemctl", ["daemon-reload"]);

  ctx.log("Masking classic smbd/nmbd/winbind services (AD DC role uses the unified samba-ad-dc service)...");
  // `mask` alone only blocks *future* starts — it does not stop an instance
  // already running (confirmed live: a leftover nmbd from before this step
  // held /run/samba/nmbd.pid, causing samba-ad-dc's own embedded nmbd to
  // fail to start with "nmbd is already running"). Stop first.
  await ctx.runQuick("systemctl", ["stop", "smbd", "nmbd", "winbind"]);
  await ctx.runQuick("systemctl", ["mask", "smbd", "nmbd", "winbind"]);
  await ctx.runQuick("systemctl", ["unmask", "samba-ad-dc"]);
  await ctx.runQuick("systemctl", ["enable", "--now", "samba-ad-dc"]);

  ctx.log("Installing generated krb5.conf...");
  await ctx.runQuick("cp", ["/var/lib/samba/private/krb5.conf", "/etc/krb5.conf"]);

  // The restored smb.conf already has the real realm/workgroup baked in
  // (from the backed-up domain) — read them back rather than asking the
  // admin to retype something that must match exactly, same as join.service.ts.
  const finalSmbConf = readFileSync("/etc/samba/smb.conf", "utf8");
  const realm = finalSmbConf.match(/^\s*realm\s*=\s*(\S+)/im)?.[1]?.toUpperCase() ?? "";
  const domain = finalSmbConf.match(/^\s*workgroup\s*=\s*(\S+)/im)?.[1] ?? "";

  ctx.log("Configuring DNS resolution...");
  const forwarders = await getForwarders().catch(() => []);
  const resolvConfLines = ["nameserver 127.0.0.1", ...forwarders.map((fw) => `nameserver ${fw}`), `search ${realm.toLowerCase()}`];
  writeFileSync("/etc/resolv.conf", `${resolvConfLines.join("\n")}\n`);

  const dhclientConfPath = "/etc/dhcp/dhclient.conf";
  if (existsSync(dhclientConfPath)) {
    const current = readFileSync(dhclientConfPath, "utf8");
    if (!/^\s*supersede\s+domain-name-servers/m.test(current)) {
      const dhclientServers = ["127.0.0.1", ...forwarders].join(", ");
      writeFileSync(dhclientConfPath, `${current.trimEnd()}\nsupersede domain-name-servers ${dhclientServers};\n`);
    }
  }

  ctx.log("Verifying the restored domain...");
  await ctx.runQuick("samba-tool", ["domain", "info", "127.0.0.1"]);
  await ctx.runQuick("samba-tool", ["dbcheck"]);

  return { realm, domain, hostname, ip, dnsBackend: "SAMBA_INTERNAL" };
}

export function startRestoreJob(backupFilePath: string, params: RestoreParams): string {
  return startExecutorJob("domain-restore", async (ctx) => {
    try {
      const summary = await runRestoreSteps(ctx, backupFilePath, params);
      writeProvisionMarker(summary);
      ctx.log(`Domain ${summary.realm} restored successfully on ${summary.hostname} (${summary.ip}).`);
    } finally {
      rmSync(backupFilePath, { force: true });
    }
  });
}
