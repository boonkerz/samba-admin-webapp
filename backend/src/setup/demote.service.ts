import { existsSync, rmSync } from "node:fs";
import type ldap from "ldapjs";
import type { DemoteEligibility } from "@samba-admin/shared";
import { startExecutorJob, type JobContext } from "../jobs/jobRunner.js";
import { listObjects } from "../directory/objects.service.js";
import { realmToBaseDn } from "../directory/ldapUtil.js";
import { readProvisionSummary, clearProvisionMarker } from "../state/provisionState.js";

/**
 * "Remove a domain controller" — the counterpart to join.service.ts. Mirrors
 * Windows Server's "Uninstall Active Directory Domain Services" flow: demote
 * this DC out of the domain, then return the box to a bare state so it can
 * be re-provisioned or re-joined fresh.
 */

async function countDomainControllers(client: ldap.Client, baseDn: string): Promise<number> {
  const computers = await listObjects(client, `OU=Domain Controllers,${baseDn}`, "computer");
  return computers.length;
}

export async function checkDemoteEligibility(client: ldap.Client): Promise<DemoteEligibility> {
  const summary = readProvisionSummary();
  if (!summary) return { eligible: false, dcCount: 0, reason: "Nicht provisioniert." };

  const dcCount = await countDomainControllers(client, realmToBaseDn(summary.realm));
  if (dcCount <= 1) {
    return {
      eligible: false,
      dcCount,
      reason:
        "Dies ist der letzte Domain Controller dieser Domäne. Ihn zu entfernen würde die Domäne zerstören — das unterstützt dieser Assistent nicht.",
    };
  }
  return { eligible: true, dcCount };
}

async function runDemoteSteps(ctx: JobContext, username: string, password: string): Promise<void> {
  // -P (--machine-pass) is NOT enough here: confirmed live that the demote's
  // "Changing userControl and container" step (reparenting the computer
  // object out of OU=Domain Controllers, clearing its server-trust bits)
  // fails with "insufficient access rights" under the machine account's own
  // self-service rights. Use the logged-in admin's own credentials instead,
  // same pattern as backup.service.ts.
  ctx.log("Demoting this server out of the domain...");
  const exitCode = await ctx.runStreamed("samba-tool", ["domain", "demote", `-U${username}%${password}`], [password]);
  if (exitCode !== 0) {
    throw new Error(`samba-tool domain demote exited with code ${exitCode}`);
  }

  ctx.log("Stopping the AD DC service...");
  await ctx.runQuick("systemctl", ["stop", "samba-ad-dc"]);
  await ctx.runQuick("systemctl", ["disable", "samba-ad-dc"]);
  await ctx.runQuick("systemctl", ["unmask", "smbd", "nmbd", "winbind"]);

  ctx.log("Clearing local domain configuration and data so this server can be re-provisioned or re-joined...");
  if (existsSync("/etc/samba/smb.conf")) {
    rmSync("/etc/samba/smb.conf", { force: true });
  }
  for (const dir of ["private", "sysvol", "bind-dns"]) {
    rmSync(`/var/lib/samba/${dir}`, { recursive: true, force: true });
  }
  rmSync("/etc/systemd/system/samba-ad-dc.service.d", { recursive: true, force: true });
  await ctx.runQuick("systemctl", ["daemon-reload"]);

  clearProvisionMarker();
  ctx.log("Done. This server is no longer a domain controller.");
}

export function startDemoteJob(username: string, password: string): string {
  return startExecutorJob("demote-domain", (ctx) => runDemoteSteps(ctx, username, password), { redact: [password] });
}
