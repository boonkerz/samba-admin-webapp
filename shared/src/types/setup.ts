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

/**
 * Params for joining this (freshly installed, unprovisioned) server to an
 * *existing* domain as an additional domain controller — the Samba
 * equivalent of Windows Server's "Add a domain controller to an existing
 * domain" path in the AD DS Configuration Wizard. Unlike ProvisionParams,
 * there is no NetBIOS domain name to collect: `samba-tool domain join`
 * discovers it from the existing domain via DNS/LDAP.
 */
export interface JoinDomainParams {
  /** DNS realm of the domain to join, e.g. CORP.EXAMPLE.COM. */
  realm: string;
  /** IP address (or hostname) of an existing, reachable DC — used to point this server's DNS at the domain before joining. */
  existingDcAddress: string;
  /** Username of a domain account with rights to join a computer/DC (e.g. "administrator"). */
  joinUsername: string;
  joinPassword: string;
}

export interface JoinValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof JoinDomainParams, string>>;
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

export type JobKind =
  | "package-install"
  | "provision"
  | "join-domain"
  | "demote-domain"
  | "domain-backup"
  | "domain-restore"
  | "gpo-create"
  | "gpo-copy"
  | "gpo-restore"
  | "print-server-setup"
  | "fileshare-create"
  | "fileshare-update"
  | "fileshare-delete";

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

/** Result of checking whether this DC can safely be demoted — see demote.service.ts. */
export interface DemoteEligibility {
  eligible: boolean;
  dcCount: number;
  reason?: string;
}

export interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RestoreParams {
  newServerName: string;
  hostIp?: string;
}

export interface RestoreValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof RestoreParams, string>>;
}
