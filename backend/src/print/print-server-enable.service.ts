import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { PrintServerStatus } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";
import { startExecutorJob, type JobContext } from "../jobs/jobRunner.js";
import { ensurePrintSharesConfigured, smbConfHasPrintShares } from "./smbconf.service.js";

export async function getPrintServerStatus(): Promise<PrintServerStatus> {
  const cupsActiveResult = await runCapture("systemctl", ["is-active", "cups"]);
  const cupsActive = cupsActiveResult.stdout.trim() === "active";
  const cupsInstalledResult = await runCapture("systemctl", ["show", "cups", "--property=LoadState"]);
  const cupsInstalled = cupsActive || /LoadState=loaded/.test(cupsInstalledResult.stdout);
  const smbConfConfigured = smbConfHasPrintShares();
  const hostnameResult = await runCapture("hostname", ["-f"]);

  return {
    cupsInstalled,
    cupsActive,
    smbConfConfigured,
    ready: cupsInstalled && cupsActive && smbConfConfigured,
    hostname: hostnameResult.stdout.trim(),
  };
}

const POLICY_RC_D_PATH = "/usr/sbin/policy-rc.d";
const POLICY_RC_D_BACKUP_PATH = "/usr/sbin/policy-rc.d.samba-admin-webapp-backup";
const CLASSIC_SMB_SERVICES = ["smbd", "nmbd", "winbind"];

/**
 * Installing cups-client/smbclient pulls in a samba/samba-common-bin package
 * chain upgrade (confirmed live) — and that package's postinst unmasks +
 * starts the classic smbd/nmbd/winbind services via deb-systemd-invoke,
 * undoing the masking `provision.service.ts` did for the AD-DC role (which
 * uses the unified samba-ad-dc process instead). The result: smbd/nmbd fight
 * samba-ad-dc for the same ports, breaking file sharing, DNS, and
 * everything else Samba serves — confirmed live (samba-ad-dc crash-looping
 * with "smbd is already running"/"nmbd is already running").
 *
 * `policy-rc.d` is the Debian-sanctioned mechanism for exactly this: a
 * script consulted by `invoke-rc.d`/`deb-systemd-invoke` before starting a
 * service during package operations. Returning 101 for these three service
 * names blocks the postinst's restart attempt outright, before it can ever
 * happen — this prevents the problem rather than cleaning up after it.
 */
async function withClassicSmbStartsBlocked<T>(ctx: JobContext, fn: () => Promise<T>): Promise<T> {
  const hadExistingPolicy = existsSync(POLICY_RC_D_PATH);
  if (hadExistingPolicy) {
    renameSync(POLICY_RC_D_PATH, POLICY_RC_D_BACKUP_PATH);
  }
  const script = `#!/bin/sh\ncase "$1" in\n${CLASSIC_SMB_SERVICES.map((s) => `  ${s})\n    exit 101\n    ;;`).join(
    "\n"
  )}\n  *)\n    exit 0\n    ;;\nesac\n`;
  writeFileSync(POLICY_RC_D_PATH, script, { mode: 0o755 });

  try {
    return await fn();
  } finally {
    rmSync(POLICY_RC_D_PATH, { force: true });
    if (hadExistingPolicy) {
      renameSync(POLICY_RC_D_BACKUP_PATH, POLICY_RC_D_PATH);
    }
    // Belt-and-suspenders: re-assert the correct state even if something
    // slipped past policy-rc.d (e.g. a maintainer script calling systemctl
    // directly instead of going through deb-systemd-invoke).
    ctx.log("Re-asserting samba-ad-dc as the active Samba service...");
    await ctx.runQuick("systemctl", ["stop", ...CLASSIC_SMB_SERVICES]);
    await ctx.runQuick("systemctl", ["mask", ...CLASSIC_SMB_SERVICES]);
    const sambaAdDcExists = await runCapture("systemctl", ["show", "samba-ad-dc", "--property=LoadState"]);
    if (/LoadState=loaded/.test(sambaAdDcExists.stdout)) {
      await ctx.runQuick("systemctl", ["restart", "samba-ad-dc"]);
    }
  }
}

async function runPrintServerSetupSteps(ctx: JobContext): Promise<void> {
  ctx.log("Checking current print-server configuration...");
  const status = await getPrintServerStatus();

  if (!status.cupsInstalled) {
    ctx.log("Installing CUPS...");
    await ctx.runQuick("apt-get", ["update"]);
    const exitCode = await withClassicSmbStartsBlocked(ctx, () =>
      ctx.runStreamed("apt-get", [
        "-y",
        "-o",
        "Dpkg::Options::=--force-confold",
        "--no-install-recommends",
        "install",
        "cups",
        "cups-client",
        "smbclient",
      ])
    );
    if (exitCode !== 0) throw new Error(`apt-get install cups exited with code ${exitCode}`);
  } else {
    ctx.log("CUPS is already installed.");
  }

  await ensurePrintSharesConfigured((text) => ctx.log(text));

  ctx.log("Enabling and starting the CUPS service...");
  await ctx.runQuick("systemctl", ["enable", "--now", "cups"]);

  ctx.log("Print server setup complete.");
}

export function startPrintServerSetupJob(): string {
  return startExecutorJob("print-server-setup", runPrintServerSetupSteps);
}
