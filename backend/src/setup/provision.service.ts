import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ProvisionParams, ProvisionValidationResult, SetupSummary } from "@samba-admin/shared";
import { startExecutorJob, type JobContext } from "../jobs/jobRunner.js";
import { writeProvisionMarker } from "../state/provisionState.js";
import { config } from "../config.js";
import { getForwarders } from "../dns/dns-forwarders.service.js";

const REALM_RE = /^[A-Z0-9]([A-Z0-9-]{0,61}[A-Z0-9])?(\.[A-Z0-9]([A-Z0-9-]{0,61}[A-Z0-9])?)+$/;
const NETBIOS_RE = /^[A-Z0-9][A-Z0-9-]{0,14}$/;

function passwordComplexityOk(password: string): boolean {
  if (password.length < 8) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];
  const satisfied = classes.filter((re) => re.test(password)).length;
  return satisfied >= 3;
}

export function validateProvisionParams(
  params: ProvisionParams & { adminPasswordConfirm: string }
): ProvisionValidationResult {
  const errors: ProvisionValidationResult["errors"] = {};

  if (!REALM_RE.test(params.realm)) {
    errors.realm = "Realm must be an uppercase DNS-style name with at least two labels, e.g. CORP.EXAMPLE.COM.";
  }
  if (!NETBIOS_RE.test(params.domain)) {
    errors.domain = "Domain (NetBIOS) name must be 1-15 uppercase letters/digits/hyphens, no dots.";
  }
  if (!passwordComplexityOk(params.adminPassword)) {
    errors.adminPassword = "Password must be at least 8 characters and include 3 of: lowercase, uppercase, digit, symbol.";
  }
  if (params.adminPassword !== params.adminPasswordConfirm) {
    errors.adminPasswordConfirm = "Passwords do not match.";
  }
  if (!params.dnsBackend) {
    errors.dnsBackend = "DNS backend is required.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function detectPrimaryIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    if (name === "lo") continue;
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  throw new Error("Could not detect a non-loopback IPv4 address for this host.");
}

async function runProvisionSteps(ctx: JobContext, params: ProvisionParams): Promise<SetupSummary> {
  const hostname = (await ctx.runQuick("hostnamectl", ["--static"])).stdout.trim() || os.hostname();
  const ip = detectPrimaryIp();

  // samba-tool refuses to provision if smb.conf exists or if private/sysvol
  // already contain data. Both happen after a failed provision attempt (it
  // writes smb.conf and starts populating /var/lib/samba before hitting
  // whatever error stopped it), so a retry needs a clean slate. The very
  // first backup of a genuinely pre-existing smb.conf is preserved; a retry
  // after a failed attempt just discards its own debris instead of
  // clobbering that original backup.
  if (existsSync("/etc/samba/smb.conf")) {
    if (existsSync("/etc/samba/smb.conf.pre-provision.bak")) {
      ctx.log("Removing smb.conf left over from a previous failed provision attempt...");
      rmSync("/etc/samba/smb.conf", { force: true });
    } else {
      ctx.log("Moving aside existing /etc/samba/smb.conf (samba-tool refuses to overwrite it)...");
      renameSync("/etc/samba/smb.conf", "/etc/samba/smb.conf.pre-provision.bak");
    }
  }
  for (const dir of ["private", "sysvol", "bind-dns"]) {
    rmSync(`/var/lib/samba/${dir}`, { recursive: true, force: true });
  }

  const provisionArgs = [
    "domain",
    "provision",
    "--server-role=dc",
    "--use-rfc2307",
    `--dns-backend=${params.dnsBackend}`,
    `--realm=${params.realm}`,
    `--domain=${params.domain}`,
    `--adminpass=${params.adminPassword}`,
    `--host-ip=${ip}`,
  ];
  const exitCode = await ctx.runStreamed("samba-tool", provisionArgs, [params.adminPassword]);
  if (exitCode !== 0) {
    throw new Error(`samba-tool domain provision exited with code ${exitCode}`);
  }

  // On Debian/Ubuntu's classic ifupdown+dhclient networking, `ifup` (and thus
  // network-online.target) is satisfied once dhclient is *launched*, not
  // once it actually has a lease — so samba-ad-dc can start before the
  // interface has an IP. LDAP/DNS bind to 0.0.0.0 and don't care, but the
  // kdc/cldap tasks bind to the specific interface address and fail
  // silently with no retry if it isn't there yet. Block startup until an
  // IPv4 address actually appears (bounded wait, then proceed regardless).
  // Written as a standalone script rather than inlined into the unit's
  // ExecStartPre= value — systemd unit files have their own escaping rules
  // for command-line directives (distinct from shell quoting), and nested
  // double-quotes + `\$` inside one inlined command line got silently
  // mangled ("Ignoring unknown escape sequences", then a literal shell
  // syntax error on every subsequent samba-ad-dc start/restart, taking the
  // whole DC down). A plain script file sidesteps that class of bug entirely.
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
  await ctx.runQuick("systemctl", ["mask", "smbd", "nmbd", "winbind"]);
  await ctx.runQuick("systemctl", ["unmask", "samba-ad-dc"]);
  await ctx.runQuick("systemctl", ["enable", "--now", "samba-ad-dc"]);

  ctx.log("Installing generated krb5.conf for the new realm...");
  await ctx.runQuick("cp", ["/var/lib/samba/private/krb5.conf", "/etc/krb5.conf"]);

  ctx.log("Pointing local DNS resolution at this DC's internal DNS server...");
  // A sole `nameserver 127.0.0.1` line makes this box's own OS-level DNS
  // (apt-get, etc.) depend entirely on Samba's internal DNS answering —
  // confirmed live: any hiccup there (a slow restart, momentary forwarding
  // issue) takes down external resolution completely, breaking package
  // installs with no retry path at all. Adding the same forwarder smb.conf
  // already uses as a second nameserver gives the OS resolver an automatic
  // fallback without changing anything about how AD/domain names resolve
  // (127.0.0.1 is still tried first).
  const forwarders = await getForwarders().catch(() => []);
  const resolvConfLines = ["nameserver 127.0.0.1", ...forwarders.map((ip) => `nameserver ${ip}`), `search ${params.realm.toLowerCase()}`];
  writeFileSync("/etc/resolv.conf", `${resolvConfLines.join("\n")}\n`);

  // A plain resolv.conf write doesn't survive a DHCP lease renewal — isc-dhcp-client
  // (the classic Debian/Ubuntu ifupdown setup) rewrites it from the DHCP-provided
  // nameserver on every renew/reboot, silently reverting the DC back to the
  // router's/ISP's DNS. Telling dhclient itself to always supersede that value
  // makes the fix durable instead of a one-time write that quietly regresses.
  const dhclientConfPath = "/etc/dhcp/dhclient.conf";
  if (existsSync(dhclientConfPath)) {
    const current = readFileSync(dhclientConfPath, "utf8");
    if (!/^\s*supersede\s+domain-name-servers/m.test(current)) {
      ctx.log("Configuring dhclient to always use this DC (with fallback) for DNS (survives lease renewal)...");
      const dhclientServers = ["127.0.0.1", ...forwarders].join(", ");
      writeFileSync(dhclientConfPath, `${current.trimEnd()}\nsupersede domain-name-servers ${dhclientServers};\n`);
    }
  }

  ctx.log("Verifying the new domain...");
  await ctx.runQuick("samba-tool", ["domain", "info", "127.0.0.1"]);
  await ctx.runQuick("samba-tool", ["dbcheck"]);

  return {
    realm: params.realm,
    domain: params.domain,
    hostname,
    ip,
    dnsBackend: params.dnsBackend,
  };
}

export function startProvisionJob(params: ProvisionParams): string {
  return startExecutorJob(
    "provision",
    async (ctx) => {
      const summary = await runProvisionSteps(ctx, params);
      writeProvisionMarker(summary);
      ctx.log(`Domain ${summary.realm} provisioned successfully on ${summary.hostname} (${summary.ip}).`);
    },
    { redact: [params.adminPassword] }
  );
}
