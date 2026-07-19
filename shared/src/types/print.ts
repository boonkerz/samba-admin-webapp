export type CupsPrinterState = "idle" | "printing" | "stopped";

export interface PrintServerStatus {
  cupsInstalled: boolean;
  cupsActive: boolean;
  smbConfConfigured: boolean;
  ready: boolean;
  /** This server's own hostname — used to build `\\hostname\printer` suggestions for GPO printer connections. */
  hostname: string;
}

/**
 * `driverId` is this app's own bookkeeping for a Windows driver assigned via
 * `net rpc printer driver` — unrelated to any CUPS-side PPD/model, which
 * only matters for Linux/CUPS printing and isn't tracked here at all.
 */
export interface CupsPrinterSummary {
  name: string;
  deviceUri: string;
  state: CupsPrinterState;
  accepting: boolean;
  shared: boolean;
  isDefault: boolean;
  location?: string;
  comment?: string;
  driverId?: string;
}

export interface CreateCupsPrinterRequest {
  name: string;
  deviceUri: string;
  location?: string;
  comment?: string;
  shared?: boolean;
}

export type UpdateCupsPrinterRequest = Partial<Omit<CreateCupsPrinterRequest, "name">>;

export interface DeviceUriOption {
  uri: string;
  scheme: string;
  description: string;
}

export interface PpdModelOption {
  ppdName: string;
  description: string;
}

export type DriverArch = "x64" | "W32X86";

export interface WindowsDriverPackage {
  driverId: string;
  displayName: string;
  arch: DriverArch;
  infFileName: string;
  files: string[];
  uploadedAt: string;
  installedInSamba: boolean;
}

/**
 * Status of this app's own printer-config sync loop — mirrors
 * SysvolSyncStatus's shape/semantics (see shared/src/types/directory.ts):
 * the PDC emulator is the single authoritative source for print queue
 * definitions and the uploaded driver library, every other DC pulls from
 * it. Deliberately does NOT cover the actual Windows driver *registration*
 * in Samba's print$ store (`rpcclient adddriver`/`setdriver`) — that needs
 * real domain admin rights this app doesn't persist, so it stays a one-time
 * manual "Treiber zuweisen" action per printer on each replica.
 */
export type PrintSyncRole = "source" | "replica" | "unavailable";

export interface PrintSyncStatus {
  role: PrintSyncRole;
  sourceDc?: string;
  lastSyncAt?: string;
  lastSyncOk?: boolean;
  lastError?: string;
}
