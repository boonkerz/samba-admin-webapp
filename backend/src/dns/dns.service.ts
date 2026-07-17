import type { DnsRecordType, DnsZoneSummary, DnsZoneInfo, DnsNode, DnsRecord } from "@samba-admin/shared";
import { runDnsTool, DNS_SERVER, type DnsCredentials } from "./dns-tool.js";

/**
 * Parses the "  key : value" block format used by every samba-tool dns
 * subcommand (see print_zone/print_zoneinfo in samba's netcmd/dns.py).
 */
function parseKeyValueBlock(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z]\w*)\s*:\s?(.*)$/.exec(line);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
}

function mapZoneType(raw: string | undefined): DnsZoneSummary["zoneType"] {
  switch (raw) {
    case "DNS_ZONE_TYPE_SECONDARY":
      return "secondary";
    case "DNS_ZONE_TYPE_STUB":
      return "stub";
    case "DNS_ZONE_TYPE_FORWARDER":
      return "forwarder";
    default:
      return "primary";
  }
}

function mapAllowUpdate(raw: string | undefined): DnsZoneInfo["allowUpdate"] {
  switch (raw) {
    case "DNS_ZONE_UPDATE_UNSECURE":
      return "nonsecure";
    case "DNS_ZONE_UPDATE_SECURE":
      return "secure";
    default:
      return "none";
  }
}

export async function listZones(creds: DnsCredentials): Promise<DnsZoneSummary[]> {
  const out = await runDnsTool(creds, ["zonelist", DNS_SERVER]);
  const blocks = out.split(/\n\s*\n/).filter((b) => b.includes("pszZoneName"));
  return blocks.map((block) => {
    const kv = parseKeyValueBlock(block);
    const flags = kv["Flags"] ?? "";
    const dpFlags = kv["dwDpFlags"] ?? "";
    return {
      name: kv["pszZoneName"],
      zoneType: mapZoneType(kv["ZoneType"]),
      reverse: flags.includes("DNS_RPC_ZONE_REVERSE"),
      dsIntegrated: flags.includes("DNS_RPC_ZONE_DSINTEGRATED"),
      directoryPartition: dpFlags.includes("DNS_DP_FOREST_DEFAULT") ? "forest" : "domain",
    };
  });
}

export async function getZoneInfo(creds: DnsCredentials, zone: string): Promise<DnsZoneInfo> {
  const out = await runDnsTool(creds, ["zoneinfo", DNS_SERVER, zone]);
  const kv = parseKeyValueBlock(out);
  return {
    name: kv["pszZoneName"] ?? zone,
    zoneType: mapZoneType(kv["dwZoneType"]),
    reverse: kv["fReverse"] === "TRUE",
    dsIntegrated: kv["fUseDatabase"] === "TRUE",
    directoryPartition: (kv["dwDpFlags"] ?? "").includes("DNS_DP_FOREST_DEFAULT") ? "forest" : "domain",
    allowUpdate: mapAllowUpdate(kv["fAllowUpdate"]),
    aging: kv["fAging"] === "TRUE",
    noRefreshIntervalHours: Number(kv["dwNoRefreshInterval"] ?? 0),
    refreshIntervalHours: Number(kv["dwRefreshInterval"] ?? 0),
  };
}

export async function createZone(
  creds: DnsCredentials,
  zoneName: string,
  opts: { directoryPartition?: "domain" | "forest" } = {}
): Promise<void> {
  const args = ["zonecreate", DNS_SERVER, zoneName];
  if (opts.directoryPartition) args.push("--dns-directory-partition", opts.directoryPartition);
  await runDnsTool(creds, args);
}

export async function deleteZone(creds: DnsCredentials, zoneName: string): Promise<void> {
  await runDnsTool(creds, ["zonedelete", DNS_SERVER, zoneName]);
}

export async function setZoneOptions(
  creds: DnsCredentials,
  zoneName: string,
  opts: { aging?: boolean; noRefreshIntervalHours?: number; refreshIntervalHours?: number }
): Promise<void> {
  const args = ["zoneoptions", DNS_SERVER, zoneName];
  if (opts.aging !== undefined) args.push("--aging", opts.aging ? "1" : "0");
  if (opts.noRefreshIntervalHours !== undefined) args.push("--norefreshinterval", String(opts.noRefreshIntervalHours));
  if (opts.refreshIntervalHours !== undefined) args.push("--refreshinterval", String(opts.refreshIntervalHours));
  await runDnsTool(creds, args);
}

function stripTrailingDot(s: string): string {
  return s.endsWith(".") ? s.slice(0, -1) : s;
}

/**
 * Parses one "<TYPE>: <body> (flags=.., serial=N, ttl=N)" line, matching
 * print_dns_record()'s exact text format in samba's netcmd/dns.py — the
 * `data` field this produces is the round-trippable string that update/
 * delete's <data> argument expects; `displayData` is for the UI only.
 */
function parseRecordBody(type: string, body: string, serial: number, ttlSeconds: number): DnsRecord | undefined {
  switch (type) {
    case "A":
    case "AAAA":
      return { type, data: body, displayData: body, ttlSeconds, serial };
    case "PTR":
    case "NS":
    case "CNAME": {
      const name = stripTrailingDot(body);
      return { type, data: name, displayData: name, ttlSeconds, serial };
    }
    case "SOA": {
      const m = /^serial=(\d+), refresh=(\d+), retry=(\d+), expire=(\d+), minttl=(\d+), ns=(\S+), email=(\S+)$/.exec(body);
      if (!m) return undefined;
      const [, soaSerial, refresh, retry, expire, minttl, ns, email] = m;
      const nsName = stripTrailingDot(ns);
      const emailName = stripTrailingDot(email);
      return {
        type,
        data: `${nsName} ${emailName} ${soaSerial} ${refresh} ${retry} ${expire} ${minttl}`,
        displayData: `[${soaSerial}], ${ns}, ${email}, ${refresh}, ${retry}, ${expire}, ${minttl}`,
        ttlSeconds,
        serial,
      };
    }
    case "MX": {
      const m = /^(\S+) \((\d+)\)$/.exec(body);
      if (!m) return undefined;
      const target = stripTrailingDot(m[1]);
      return { type, data: `${target} ${m[2]}`, displayData: `${target} (Priorität ${m[2]})`, ttlSeconds, serial };
    }
    case "SRV": {
      const m = /^(\S+) \((\d+), (\d+), (\d+)\)$/.exec(body);
      if (!m) return undefined;
      const target = stripTrailingDot(m[1]);
      const [, , port, priority, weight] = m;
      return {
        type,
        data: `${target} ${port} ${priority} ${weight}`,
        displayData: `${target}:${port} (Priorität ${priority}, Gewichtung ${weight})`,
        ttlSeconds,
        serial,
      };
    }
    case "TXT": {
      const parts = [...body.matchAll(/"([^"]*)"/g)].map((mm) => mm[1]);
      return { type, data: parts.map((p) => `'${p}'`).join(" "), displayData: parts.join(", "), ttlSeconds, serial };
    }
    default:
      return undefined;
  }
}

/** Parses `samba-tool dns query <server> <zone> <name> ALL` output: the direct children of <name>. */
export function parseQueryChildren(text: string): DnsNode[] {
  const headerRe = /^\s*Name=([^,]*), Records=(\d+), Children=(\d+)\s*$/;
  const recordRe = /^\s{4}(\w+): (.+) \(flags=([0-9a-fA-F]+), serial=(\d+), ttl=(\d+)\)\s*$/;
  const nodes: DnsNode[] = [];
  let current: DnsNode | undefined;
  for (const line of text.split("\n")) {
    const h = headerRe.exec(line);
    if (h) {
      current = { name: h[1], recordCount: Number(h[2]), childCount: Number(h[3]), records: [] };
      nodes.push(current);
      continue;
    }
    const r = recordRe.exec(line);
    if (r && current) {
      const record = parseRecordBody(r[1], r[2], Number(r[4]), Number(r[5]));
      if (record) current.records.push(record as DnsRecord);
    }
  }
  return nodes;
}

export async function queryChildren(creds: DnsCredentials, zone: string, name: string): Promise<DnsNode[]> {
  const out = await runDnsTool(creds, ["query", DNS_SERVER, zone, name, "ALL"]);
  return parseQueryChildren(out);
}

/** Converts structured per-type form fields into the exact <data> string samba-tool dns add/update/delete expects. */
export function formatRecordData(type: DnsRecordType, fields: Record<string, string | number | string[]>): string {
  switch (type) {
    case "A":
    case "AAAA":
      return String(fields.address);
    case "CNAME":
    case "NS":
    case "PTR":
      return String(fields.target);
    case "MX":
      return `${fields.target} ${fields.preference}`;
    case "SRV":
      return `${fields.target} ${fields.port} ${fields.priority} ${fields.weight}`;
    case "TXT": {
      const strings = Array.isArray(fields.strings) ? fields.strings : String(fields.strings).split(",");
      return strings.map((s) => `'${s}'`).join(" ");
    }
    case "SOA":
      return `${fields.primaryServer} ${fields.adminEmail} ${fields.serial} ${fields.refresh} ${fields.retry} ${fields.expire} ${fields.minimumTtl}`;
    default:
      throw new Error(`Unbekannter Datensatztyp: ${type}`);
  }
}

export async function addRecord(creds: DnsCredentials, zone: string, name: string, type: DnsRecordType, data: string): Promise<void> {
  await runDnsTool(creds, ["add", DNS_SERVER, zone, name, type, data]);
}

export async function updateRecord(
  creds: DnsCredentials,
  zone: string,
  name: string,
  type: DnsRecordType,
  oldData: string,
  newData: string
): Promise<void> {
  await runDnsTool(creds, ["update", DNS_SERVER, zone, name, type, oldData, newData]);
}

export async function deleteRecord(creds: DnsCredentials, zone: string, name: string, type: DnsRecordType, data: string): Promise<void> {
  await runDnsTool(creds, ["delete", DNS_SERVER, zone, name, type, data]);
}
