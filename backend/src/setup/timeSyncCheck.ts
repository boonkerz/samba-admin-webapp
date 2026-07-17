import { runCapture } from "../exec/safeExec.js";

export interface TimeSyncCheckResult {
  active: boolean;
  service?: string;
  /** Set when inactive specifically because of a missing capability (typical for an unprivileged container) rather than a real problem. */
  containerCapabilityNote?: string;
}

const CANDIDATE_SERVICES = ["chronyd", "chrony", "systemd-timesyncd", "ntp"];

/**
 * chrony's unit file gates on `ConditionCapability=CAP_SYS_TIME` — inside an
 * LXC container (confirmed live: `systemd-detect-virt` reports "lxc") that
 * capability usually isn't granted, so systemd deliberately *skips* starting
 * chrony rather than failing. This isn't actually a problem: an LXC
 * container shares its host's kernel clock, so the container's time is
 * already whatever the host's is — there's nothing this app can configure
 * from inside the container that grants a missing kernel capability.
 */
async function explainIfContainerCapabilityGap(service: string, timeoutMs?: number): Promise<string | undefined> {
  const condition = await runCapture("systemctl", ["show", service, "--property=ConditionResult"], { timeoutMs });
  if (condition.stdout.trim() !== "ConditionResult=no") return undefined;

  const virt = await runCapture("systemd-detect-virt", [], { timeoutMs });
  const virtType = virt.stdout.trim();
  if (!virtType || virtType === "none") return undefined;

  return `${service} kann hier nicht starten (fehlende Kernel-Capability, typisch für einen unprivilegierten ${virtType}-Container). Das ist unkritisch: der Container übernimmt die Uhrzeit vom Hostsystem — solange dieses synchronisiert ist, ist die Zeit bereits korrekt.`;
}

export async function checkTimeSync(timeoutMs?: number): Promise<TimeSyncCheckResult> {
  for (const service of CANDIDATE_SERVICES) {
    const result = await runCapture("systemctl", ["is-active", service], { timeoutMs });
    if (result.stdout.trim() === "active") return { active: true, service };
  }

  // None active — check chrony specifically for the container-capability
  // explanation (it's the one this app actually installs).
  const note = await explainIfContainerCapabilityGap("chrony", timeoutMs);
  return { active: false, containerCapabilityNote: note };
}
