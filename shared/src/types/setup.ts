export type ProvisionState = "unprovisioned" | "provisioned";

export interface SetupStateResponse {
  state: ProvisionState;
  distro?: string;
  distroVersion?: string;
  hostname?: string;
}

export type DnsBackend = "SAMBA_INTERNAL" | "BIND9_DLZ";

export interface ProvisionParams {
  realm: string;
  domain: string;
  adminPassword: string;
  dnsBackend: DnsBackend;
}

export interface ProvisionValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ProvisionParams | "adminPasswordConfirm", string>>;
}

export type PreflightCheckId =
  | "port53-conflict"
  | "hostname-fqdn"
  | "time-sync"
  | "firewall";

export interface PreflightCheckResult {
  id: PreflightCheckId;
  label: string;
  ok: boolean;
  detail: string;
  fixAvailable: boolean;
}

export interface PreflightResponse {
  distro: string;
  distroVersion: string;
  hostname: string;
  checks: PreflightCheckResult[];
}

export interface PreflightFixRequest {
  actions: PreflightCheckId[];
}

export type JobKind = "package-install" | "provision" | "gpo-create" | "gpo-copy" | "gpo-restore" | "print-server-setup";

export type JobStatus = "running" | "succeeded" | "failed";

export interface JobStartedResponse {
  jobId: string;
}

export interface JobLogLine {
  seq: number;
  stream: "stdout" | "stderr" | "meta";
  text: string;
  timestamp: string;
}

export interface JobSnapshot {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  lines: JobLogLine[];
  exitCode?: number;
}

export interface SetupSummary {
  realm: string;
  domain: string;
  hostname: string;
  ip: string;
  dnsBackend: DnsBackend;
}
