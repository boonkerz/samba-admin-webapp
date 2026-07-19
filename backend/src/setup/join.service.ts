import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { JoinDomainParams, JoinValidationResult, SetupSummary } from "@samba-admin/shared";
import { startExecutorJob, type JobContext } from "../jobs/jobRunner.js";
import { writeProvisionMarker } from "../state/provisionState.js";
import { config } from "../config.js";
import { getForwarders } from "../dns/dns-forwarders.service.js";
import { REALM_RE, detectPrimaryIp } from "./provision.service.js";

/**
 * "Join an existing domain" — the Samba equivalent of Windows Server's "Add
 * a domain controller to an existing domain" path in the AD DS Configuration
 * Wizard. Unlike provisioning a new forest, there's no NetBIOS domain name to
 * collect here: `samba-tool domain join` discovers it from the existing
 * domain over DNS/LDAP once it can reach it.
 */
export function validateJoinParams(params: JoinDomainParams): JoinValidationResult {
  const errors: JoinValidationResult["errors"] = {};

  if (!REALM_RE.test(params.realm)) {
    errors.realm = "Realm must be an uppercase DNS-style name with at least two labels, e.g. CORP.EXAMPLE.COM.";
  }
  if (!params.existingDcAddress.trim()) {
    errors.existingDcAddress = "The address (IP or hostname) of an existing, reachable domain controller is required.";
  }
  if (!params.joinUsername.trim()) {
    errors.joinUsername = "A domain account with rights to join a DC (e.g. a Domain Admin) is required.";
  }
  if (!params.joinPassword) {
    errors.joinPassword = "Password is required.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Quick TCP reachability probe (SMB port) run as the first job step — fails
 * fast with a clear, specific error message before attempting the actual
 * join, rather than letting `samba-tool domain join` fail deep into its own
 * DNS/Kerberos retry logic with a much more opaque error.
 */
function checkReachable(host: string, port = 445, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${host}:${port}.`));
    });
    socket.once("error", (err: Error) => {
      reject(new Error(`Could not reach ${host}:${port}: ${err.message}`));
    });
  });
}

async function runJoinSteps(ctx: JobContext, params: JoinDomainParams): Promise<SetupSummary> {
  const hostname = (await ctx.runQuick("hostnamectl", ["--static"])).stdout.trim() || os.hostname();
  const ip = detectPrimaryIp();

  ctx.log(`Checking reachability of ${params.existingDcAddress}...`);
  await checkReachable(params.existingDcAddress);

  // samba-tool needs to resolve the domain's SRV records and reach the
  // existing DC via Kerberos/LDAP to join — point this server's DNS at it
  // first. Rewritten again after a successful join (see below) to prefer
  // this DC's own internal DNS, keeping the existing DC only as a fallback.
  ctx.log("Pointing DNS at the existing domain controller for the join...");
  writeFileSync("/etc/resolv.conf", `nameserver ${params.existingDcAddress}\nsearch ${params.realm.toLowerCase()}\n`);

  // Same retry-safety cleanup as a fresh provision (see provision.service.ts)
  // — samba-tool refuses to join if smb.conf or private/sysvol already
  // contain data, which happens after any failed attempt.
  if (existsSync("/etc/samba/smb.conf")) {
    if (existsSync("/etc/samba/smb.conf.pre-provision.bak")) {
      ctx.log("Removing smb.conf left over from a previous failed join attempt...");
      rmSync("/etc/samba/smb.conf", { force: true });
    } else {
      ctx.log("Moving aside existing /etc/samba/smb.conf (samba-tool refuses to overwrite it)...");
      renameSync("/etc/samba/smb.conf", "/etc/samba/smb.conf.pre-provision.bak");
    }
  }
  for (const dir of ["private", "sysvol", "bind-dns"]) {
    rmSync(`/var/lib/samba/${dir}`, { recursive: true, force: true });
  }

  // NOTE: unlike `domain provision`, `domain join` takes the DNS domain as a
  // positional argument and has no separate `--realm=` flag — this hasn't
  // been exercised end to end (it needs a second, already-provisioned DC to
  // join against), so double-check `samba-tool domain join --help` against
  // your Samba version if this step fails.
  const joinArgs = ["domain", "join", params.realm, "DC", `-U${params.joinUsername}%${params.joinPassword}`, "--dns-backend=SAMBA_INTERNAL"];
  const exitCode = await ctx.runStreamed("samba-tool", joinArgs, [params.joinPassword]);
  if (exitCode !== 0) {
    throw new Error(`samba-tool domain join exited with code ${exitCode}`);
  }

  // From here on, mirrors provision.service.ts's post-provision steps.
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

  ctx.log("Installing generated krb5.conf for the joined realm...");
  await ctx.runQuick("cp", ["/var/lib/samba/private/krb5.conf", "/etc/krb5.conf"]);

  ctx.log("Switching DNS resolution to this DC's own internal DNS server, with the existing DC kept as fallback...");
  const forwarders = await getForwarders().catch(() => []);
  const resolvConfLines = [
    "nameserver 127.0.0.1",
    `nameserver ${params.existingDcAddress}`,
    ...forwarders.map((fw) => `nameserver ${fw}`),
    `search ${params.realm.toLowerCase()}`,
  ];
  writeFileSync("/etc/resolv.conf", `${resolvConfLines.join("\n")}\n`);

  const dhclientConfPath = "/etc/dhcp/dhclient.conf";
  if (existsSync(dhclientConfPath)) {
    const current = readFileSync(dhclientConfPath, "utf8");
    if (!/^\s*supersede\s+domain-name-servers/m.test(current)) {
      ctx.log("Configuring dhclient to always use this DC (with fallback) for DNS (survives lease renewal)...");
      const dhclientServers = ["127.0.0.1", params.existingDcAddress, ...forwarders].join(", ");
      writeFileSync(dhclientConfPath, `${current.trimEnd()}\nsupersede domain-name-servers ${dhclientServers};\n`);
    }
  }

  ctx.log("Verifying domain membership...");
  await ctx.runQuick("samba-tool", ["domain", "info", "127.0.0.1"]);
  await ctx.runQuick("samba-tool", ["dbcheck"]);

  // The NetBIOS domain name isn't something we collected from the user (it's
  // discovered from the existing domain during the join) — read it back from
  // the smb.conf samba-tool just generated.
  const smbConf = readFileSync("/etc/samba/smb.conf", "utf8");
  const workgroupMatch = smbConf.match(/^\s*workgroup\s*=\s*(\S+)/im);
  const domain = workgroupMatch?.[1] ?? params.realm.split(".")[0];

  return { realm: params.realm, domain, hostname, ip, dnsBackend: "SAMBA_INTERNAL" };
}

export function startJoinJob(params: JoinDomainParams): string {
  return startExecutorJob(
    "join-domain",
    async (ctx) => {
      const summary = await runJoinSteps(ctx, params);
      writeProvisionMarker(summary);
      ctx.log(`This server joined ${summary.realm} successfully as an additional domain controller (${summary.hostname}, ${summary.ip}).`);
    },
    { redact: [params.joinPassword] }
  );
}
