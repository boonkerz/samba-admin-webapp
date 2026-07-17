export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "NS" | "PTR" | "SOA" | "SRV" | "TXT";

export interface DnsZoneSummary {
  name: string;
  zoneType: "primary" | "secondary" | "stub" | "forwarder";
  reverse: boolean;
  dsIntegrated: boolean;
  directoryPartition: "domain" | "forest";
}

export interface DnsZoneInfo extends DnsZoneSummary {
  allowUpdate: "none" | "nonsecure" | "secure";
  aging: boolean;
  noRefreshIntervalHours: number;
  refreshIntervalHours: number;
}

export interface DnsRecord {
  type: DnsRecordType;
  data: string;
  displayData: string;
  ttlSeconds: number;
  serial: number;
}

export interface DnsNode {
  name: string;
  recordCount: number;
  childCount: number;
  records: DnsRecord[];
}
