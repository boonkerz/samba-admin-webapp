import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import type { PreflightCheckId, PreflightCheckResult, PreflightResponse } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";
import { detectDistro } from "./distro.service.js";
import { checkTimeSync as checkTimeSyncStatus } from "./timeSyncCheck.js";

async function checkPort53(): Promise<PreflightCheckResult> {
  const resolvedActive = await runCapture("systemctl", ["is-active", "systemd-resolved"]);
  const isResolvedActive = resolvedActive.stdout.trim() === "active";

  const ssResult = await runCapture("ss", ["-tulpn"]);
  const port53Lines = ssResult.stdout
    .split("\n")
    .filter((line) => line.includes(":53 ") || line.includes(":53\n"));

  const conflict = isResolvedActive || port53Lines.length > 0;
  return {
    id: "port53-conflict",
    label: "Port 53 (DNS) free for Samba's internal DNS server",
    ok: !conflict,
    detail: isResolvedActive
      ? "systemd-resolved is active and binds 127.0.0.53:53; it must be stopped and disabled."
      : port53Lines.length > 0
        ? `A process is already listening on port 53:\n${port53Lines.join("\n")}`
        : "No conflicting listener detected on port 53.",
    fixAvailable: isResolvedActive,
  };
}

async function checkHostnameFqdn(): Promise<PreflightCheckResult> {
  const hostname = readFileSync("/etc/hostname", "utf8").trim();
  const hasDot = hostname.includes(".");
  let hostsHasEntry = false;
  try {
    const hosts = readFileSync("/etc/hosts", "utf8");
    hostsHasEntry = hosts.split("\n").some((line) => {
      const parts = line.trim().split(/\s+/);
      return parts.slice(1).includes(hostname);
    });
  } catch {
    hostsHasEntry = false;
  }

  const ok = !hasDot && hostname.length > 0 && hostsHasEntry;
  return {
    id: "hostname-fqdn",
    label: "Hostname is a valid short name and present in /etc/hosts",
    ok,
    detail: hasDot
      ? `Hostname "${hostname}" contains a dot; it must be a short (non-FQDN) name.`
      : !hostsHasEntry
        ? `Hostname "${hostname}" has no matching entry in /etc/hosts.`
        : `Hostname "${hostname}" looks valid.`,
    fixAvailable: !hasDot && !hostsHasEntry,
  };
}

async function checkTimeSync(): Promise<PreflightCheckResult> {
  const status = await checkTimeSyncStatus();
  if (status.active) {
    return { id: "time-sync", label: "Time synchronization (chrony) running", ok: true, detail: `${status.service} is active.`, fixAvailable: false };
  }
  if (status.containerCapabilityNote) {
    // Not actually a problem — the container inherits its host's clock — so
    // don't show this as a failing check the admin needs to act on.
    return { id: "time-sync", label: "Time synchronization (chrony) running", ok: true, detail: status.containerCapabilityNote, fixAvailable: false };
  }
  return {
    id: "time-sync",
    label: "Time synchronization (chrony) running",
    ok: false,
    detail: "chrony is not installed/active yet. It will be installed in the package step; Kerberos requires clock skew under 5 minutes.",
    fixAvailable: false,
  };
}

async function checkFirewall(): Promise<PreflightCheckResult> {
  // ufw is not installed on a minimal/default Debian install; absence of the
  // binary itself means there is no ufw firewall to worry about.
  let active = false;
  try {
    const ufw = await runCapture("ufw", ["status"]);
    active = /^Status:\s*active/im.test(ufw.stdout);
  } catch {
    active = false;
  }
  return {
    id: "firewall",
    label: "Firewall not blocking AD DC ports",
    ok: !active,
    detail: active
      ? "ufw is active. Ensure ports 53,88,135,137-139,389,445,464,636,3268-3269 and the dynamic RPC range are permitted."
      : "No active ufw firewall detected.",
    fixAvailable: false,
  };
}

export async function runPreflight(): Promise<PreflightResponse> {
  const distro = detectDistro();
  const hostname = readFileSync("/etc/hostname", "utf8").trim();
  const checks = await Promise.all([checkPort53(), checkHostnameFqdn(), checkTimeSync(), checkFirewall()]);
  return {
    distro: distro.prettyName,
    distroVersion: distro.version,
    hostname,
    checks,
  };
}

async function fixPort53Conflict(): Promise<void> {
  await runCapture("systemctl", ["stop", "systemd-resolved"]);
  await runCapture("systemctl", ["disable", "systemd-resolved"]);
  if (existsSync("/etc/resolv.conf")) {
    unlinkSync("/etc/resolv.conf");
  }
  writeFileSync("/etc/resolv.conf", "nameserver 127.0.0.1\nnameserver 1.1.1.1\n");
}

async function fixHostnameFqdn(): Promise<void> {
  const hostname = readFileSync("/etc/hostname", "utf8").trim();
  const hosts = readFileSync("/etc/hosts", "utf8");
  const alreadyPresent = hosts.split("\n").some((line) => line.trim().split(/\s+/).slice(1).includes(hostname));
  if (!alreadyPresent) {
    writeFileSync("/etc/hosts", `${hosts.trimEnd()}\n127.0.1.1\t${hostname}\n`);
  }
}

const FIXERS: Record<PreflightCheckId, (() => Promise<void>) | undefined> = {
  "port53-conflict": fixPort53Conflict,
  "hostname-fqdn": fixHostnameFqdn,
  "time-sync": undefined,
  firewall: undefined,
};

export async function applyPreflightFixes(actions: PreflightCheckId[]): Promise<PreflightResponse> {
  for (const action of actions) {
    const fixer = FIXERS[action];
    if (fixer) await fixer();
  }
  return runPreflight();
}
