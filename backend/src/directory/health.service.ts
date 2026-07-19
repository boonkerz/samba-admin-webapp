import { runCapture } from "../exec/safeExec.js";
import type { DbcheckResult, DiskUsageEntry, FsmoRoleHolders, ReplicationNeighbor, ServerHealthSummary } from "@samba-admin/shared";
import { checkTimeSync } from "../setup/timeSyncCheck.js";
import { getSysvolSyncStatus } from "../setup/sysvolSync.service.js";
import { getPrintSyncStatus } from "../print/printSync.service.js";

const FSMO_ROLE_KEYS: Record<string, keyof FsmoRoleHolders> = {
  SchemaMasterRole: "schemaMaster",
  DomainNamingMasterRole: "domainNamingMaster",
  PdcEmulationMasterRole: "pdcEmulator",
  RidAllocationMasterRole: "ridMaster",
  InfrastructureMasterRole: "infrastructureMaster",
  DomainDnsZonesMasterRole: "domainDnsZonesMaster",
  ForestDnsZonesMasterRole: "forestDnsZonesMaster",
};

function ownerServerName(dn: string): string {
  const match = dn.match(/CN=NTDS Settings,CN=([^,]+),CN=Servers/i);
  return match ? match[1] : dn;
}

function parseFsmoShow(output: string): FsmoRoleHolders {
  const roles: FsmoRoleHolders = {
    schemaMaster: "",
    domainNamingMaster: "",
    pdcEmulator: "",
    ridMaster: "",
    infrastructureMaster: "",
    domainDnsZonesMaster: "",
    forestDnsZonesMaster: "",
  };
  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+) owner: (.+)$/);
    if (!match) continue;
    const key = FSMO_ROLE_KEYS[match[1]];
    if (key) roles[key] = ownerServerName(match[2].trim());
  }
  return roles;
}

/**
 * Best-effort parser: this test lab is a single DC, so INBOUND/OUTBOUND NEIGHBORS are always
 * empty and this has never been exercised against real multi-DC replication output. Structure
 * follows `samba-tool drs showrepl`'s documented per-NC/per-source-DSA indentation.
 */
function parseDrsShowRepl(output: string): ReplicationNeighbor[] {
  const neighbors: ReplicationNeighbor[] = [];
  const sections: { direction: "inbound" | "outbound"; text: string }[] = [];
  const inboundMatch = output.match(/==== INBOUND NEIGHBORS ====([\s\S]*?)(?:==== OUTBOUND NEIGHBORS ====|==== KCC CONNECTION OBJECTS ====|$)/);
  const outboundMatch = output.match(/==== OUTBOUND NEIGHBORS ====([\s\S]*?)(?:==== KCC CONNECTION OBJECTS ====|$)/);
  if (inboundMatch) sections.push({ direction: "inbound", text: inboundMatch[1] });
  if (outboundMatch) sections.push({ direction: "outbound", text: outboundMatch[1] });

  for (const section of sections) {
    let currentNc = "";
    let current: ReplicationNeighbor | null = null;
    for (const rawLine of section.text.split("\n")) {
      if (!rawLine.trim()) continue;
      const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
      const line = rawLine.trim();
      if (indent === 0) {
        currentNc = line;
        continue;
      }
      if (indent <= 8 && !line.startsWith("Last") && !/consecutive failure/i.test(line)) {
        if (current) neighbors.push(current);
        current = {
          direction: section.direction,
          namingContext: currentNc,
          sourceDsa: line,
          consecutiveFailures: 0,
        };
        continue;
      }
      if (!current) continue;
      const successMatch = line.match(/Last success @ (.+)$/);
      if (successMatch) current.lastSuccess = successMatch[1].trim();
      const failureMatch = line.match(/^(\d+) consecutive failure/);
      if (failureMatch) current.consecutiveFailures = Number(failureMatch[1]);
      const failedMatch = line.match(/Last attempt @ .* was unsuccessful.*: (.+)$/);
      if (failedMatch) current.lastError = failedMatch[1].trim();
    }
    if (current) neighbors.push(current);
  }
  return neighbors;
}

function parseDbcheck(output: string): DbcheckResult {
  const summaryMatch = output.match(/Checked (\d+) objects? \((\d+) errors?\)/);
  const notes = output
    .split("\n")
    .filter((line) => line.startsWith("NOTE:"))
    .map((line) => line.replace(/^NOTE:\s*/, "").trim());
  return {
    objectsChecked: summaryMatch ? Number(summaryMatch[1]) : 0,
    errorCount: summaryMatch ? Number(summaryMatch[2]) : 0,
    notes,
  };
}

function parseDf(output: string): DiskUsageEntry[] {
  const lines = output.split("\n").slice(1).filter(Boolean);
  const entries: DiskUsageEntry[] = [];
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 6) continue;
    const [, size, used, avail, pct, mount] = cols;
    entries.push({
      mount,
      sizeGb: Number(size.replace("G", "")),
      usedGb: Number(used.replace("G", "")),
      availGb: Number(avail.replace("G", "")),
      usePercent: Number(pct.replace("%", "")),
    });
  }
  return entries;
}

const TIMEOUT_MS = 15000;

export async function getServerHealth(): Promise<ServerHealthSummary> {
  const [fsmoResult, replResult, dbcheckResult, versionResult, hostnameResult, uptimeResult, dfResult, timeSync, sambaActiveResult] =
    await Promise.all([
      runCapture("samba-tool", ["fsmo", "show"], { timeoutMs: TIMEOUT_MS }),
      runCapture("samba-tool", ["drs", "showrepl"], { timeoutMs: TIMEOUT_MS }),
      runCapture("samba-tool", ["dbcheck", "--cross-ncs"], { timeoutMs: TIMEOUT_MS }),
      runCapture("samba-tool", ["--version"], { timeoutMs: TIMEOUT_MS }),
      runCapture("hostname", ["-f"], { timeoutMs: TIMEOUT_MS }),
      runCapture("uptime", ["-p"], { timeoutMs: TIMEOUT_MS }),
      runCapture("df", ["-B", "G", "/"], { timeoutMs: TIMEOUT_MS }),
      checkTimeSync(TIMEOUT_MS),
      runCapture("systemctl", ["is-active", "samba-ad-dc"], { timeoutMs: TIMEOUT_MS }),
    ]);

  return {
    hostname: hostnameResult.stdout.trim(),
    sambaVersion: versionResult.stdout.trim().split("\n").pop() ?? "",
    uptime: uptimeResult.stdout.trim(),
    diskUsage: parseDf(dfResult.stdout),
    fsmoRoles: parseFsmoShow(fsmoResult.stdout),
    replicationNeighbors: parseDrsShowRepl(replResult.stdout),
    dbcheck: parseDbcheck(dbcheckResult.stdout),
    timeSyncActive: timeSync.active,
    timeSyncService: timeSync.service,
    timeSyncNote: timeSync.containerCapabilityNote,
    samba: { active: sambaActiveResult.stdout.trim() === "active" },
    sysvolSync: getSysvolSyncStatus(),
    printSync: getPrintSyncStatus(),
    generatedAt: new Date().toISOString(),
  };
}
