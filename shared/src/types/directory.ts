import type { PrintSyncStatus } from "./print.js";

export type DirectoryObjectType = "domain" | "ou" | "container" | "user" | "group" | "computer";

export interface TreeNode {
  dn: string;
  name: string;
  type: DirectoryObjectType;
  hasChildren: boolean;
}

/** The OU tree as browsed from the Group Policy Management view (for picking where to link a GPO) — recurses to full depth, unlike the generic directory TreeNode above which is lazily expanded one level at a time. */
export interface GpoOuTreeNode {
  dn: string;
  name: string;
  childOus: GpoOuTreeNode[];
}

export interface DirectoryObjectSummary {
  dn: string;
  name: string;
  type: DirectoryObjectType;
  description?: string;
  enabled?: boolean;
  objectSid?: string;
}

export interface AdUser {
  dn: string;
  sAMAccountName: string;
  userPrincipalName?: string;
  givenName?: string;
  sn?: string;
  initials?: string;
  displayName?: string;
  description?: string;
  enabled: boolean;
  memberOf: string[];
  /** DNs of users whose `manager` points at this user (reverse lookup, read-only). */
  reports?: string[];

  // Allgemein
  office?: string;
  telephoneNumber?: string;
  email?: string;
  homePage?: string;

  // Adresse
  streetAddress?: string;
  poBox?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;

  // Rufnummern
  homePhone?: string;
  pager?: string;
  mobile?: string;
  fax?: string;
  ipPhone?: string;
  notes?: string;

  // Organisation
  title?: string;
  department?: string;
  company?: string;
  manager?: string;

  // Profil
  profilePath?: string;
  scriptPath?: string;
  homeDrive?: string;
  homeDirectory?: string;

  // Konto
  /** ISO date string, or undefined/null meaning the account never expires. */
  accountExpires?: string;
  passwordNeverExpires: boolean;
  mustChangePasswordAtNextLogon: boolean;
  /** userAccountControl SMARTCARD_REQUIRED — AD's one native "2FA" field: forces smartcard-based interactive logon. */
  smartcardRequired: boolean;

  // Einwählen
  /** msNPAllowDialin: "policy" = attribute unset ("durch NPS-Netzwerkrichtlinie steuern"). */
  networkAccessPermission: "allow" | "deny" | "policy";
  callbackNumber?: string;

  // Umgebung
  tsInitialProgram?: string;
  tsWorkDirectory?: string;
  tsConnectClientDrives: boolean;
  tsConnectPrinterDrives: boolean;
  tsDefaultToMainPrinter: boolean;

  // Sitzungen
  /** Minutes; undefined = "Nie". Unit assumption unverified against a real Windows client. */
  tsMaxDisconnectionTimeMin?: number;
  tsMaxConnectionTimeMin?: number;
  tsMaxIdleTimeMin?: number;
  /** msTSReconnectionAction: false = von jedem Client, true = nur vom Ursprungsclient. */
  tsReconnectFromOriginatingClientOnly: boolean;
}

export type UpdateUserRequest = Partial<
  Pick<
    AdUser,
    | "sAMAccountName"
    | "givenName"
    | "sn"
    | "initials"
    | "displayName"
    | "description"
    | "userPrincipalName"
    | "office"
    | "telephoneNumber"
    | "email"
    | "homePage"
    | "streetAddress"
    | "poBox"
    | "city"
    | "state"
    | "postalCode"
    | "country"
    | "homePhone"
    | "pager"
    | "mobile"
    | "fax"
    | "ipPhone"
    | "notes"
    | "title"
    | "department"
    | "company"
    | "manager"
    | "profilePath"
    | "scriptPath"
    | "homeDrive"
    | "homeDirectory"
    | "accountExpires"
    | "enabled"
    | "passwordNeverExpires"
    | "mustChangePasswordAtNextLogon"
    | "smartcardRequired"
    | "networkAccessPermission"
    | "callbackNumber"
    | "tsInitialProgram"
    | "tsWorkDirectory"
    | "tsConnectClientDrives"
    | "tsConnectPrinterDrives"
    | "tsDefaultToMainPrinter"
    | "tsMaxDisconnectionTimeMin"
    | "tsMaxConnectionTimeMin"
    | "tsMaxIdleTimeMin"
    | "tsReconnectFromOriginatingClientOnly"
  >
>;

export interface AdGroup {
  dn: string;
  sAMAccountName: string;
  description?: string;
  members: string[];
  groupType: "security" | "distribution";
  groupScope: "domainLocal" | "global" | "universal";
}

/** Fine-Grained Password Policy (msDS-PasswordSettings) — an ADAC feature, not part of ADUC itself. */
export interface PasswordSettingsObject {
  dn: string;
  name: string;
  /** Lower wins when multiple PSOs apply to the same principal. */
  precedence: number;
  passwordHistoryLength: number;
  passwordComplexityEnabled: boolean;
  reversibleEncryptionEnabled: boolean;
  minimumPasswordLengthChars: number;
  minimumPasswordAgeDays: number;
  maximumPasswordAgeDays: number;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
  lockoutObservationWindowMinutes: number;
  /** DNs of the users/groups this PSO is directly applied to. */
  appliesTo: string[];
}

export type CreatePsoRequest = Omit<PasswordSettingsObject, "dn" | "appliesTo">;
export type UpdatePsoRequest = Partial<Omit<PasswordSettingsObject, "dn" | "appliesTo" | "name">>;

// --- Active Directory-Standorte und -Dienste (dssite.msc) ---

export interface AdSite {
  dn: string;
  name: string;
  description?: string;
  servers: string[];
}

export interface AdSubnet {
  dn: string;
  name: string;
  siteDn?: string;
  description?: string;
}

export interface AdSiteLink {
  dn: string;
  name: string;
  siteDns: string[];
  cost: number;
  replicationIntervalMinutes: number;
  description?: string;
}

// --- Active Directory-Domänen und -Vertrauensstellungen (domain.msc) ---

/**
 * Read-only: establishing/removing a real trust is an inherently two-sided
 * operation requiring live connectivity and credentials to the partner
 * domain's own DC (samba-tool domain trust create/delete) — not something
 * this app can safely automate or verify without a second domain to test
 * against. Existing trusts (trustedDomain objects) are still listed here.
 */
export interface AdTrust {
  dn: string;
  name: string;
  trustPartner?: string;
  direction: "disabled" | "inbound" | "outbound" | "bidirectional" | "unknown";
  type: "downlevel" | "uplevel" | "mit" | "dce" | "unknown";
}

export interface AdComputer {
  dn: string;
  name: string;
  sAMAccountName: string;
  dNSHostName?: string;
  operatingSystem?: string;
  operatingSystemVersion?: string;
  operatingSystemServicePack?: string;
  description?: string;
  managedBy?: string;
  memberOf: string[];
  enabled: boolean;
  lastLogonTimestamp?: string;
}

export type UpdateComputerRequest = Partial<Pick<AdComputer, "description" | "managedBy">>;

export interface AdOu {
  dn: string;
  name: string;
  description?: string;
}

export interface GpoLink {
  gpoGuid: string;
  displayName: string;
  enforced: boolean;
  disabled: boolean;
  order: number;
}

export interface GpoObject {
  dn: string;
  guid: string;
  displayName: string;
  description?: string;
  flags?: number;
  gpcFileSysPath?: string;
  createdTime?: string;
  modifiedTime?: string;
}

// --- GPO properties: Bereich (Scope) tab ---

/** Reverse of GpoLink: one row per container this GPO is linked to (not one row per GPO on one container). */
export interface GpoScopeLink {
  targetDn: string;
  targetName: string;
  targetType: "domain" | "ou";
  enforced: boolean;
  linkEnabled: boolean;
  order: number;
}

export interface GpoSecurityPrincipal {
  sid: string;
  name: string;
  type: "user" | "group" | "computer" | "wellknown";
}

export interface WmiFilterRef {
  dn: string;
  name: string;
  description?: string;
}

// --- GPO properties: Delegierung (Delegation) tab ---

export type GpoDelegationPermission = "read" | "edit" | "editDeleteModifySecurity";

export interface GpoDelegationEntry extends GpoSecurityPrincipal {
  permission: GpoDelegationPermission;
  /** True for default system entries (SYSTEM/Domain Admins/Enterprise Admins/Creator Owner/Enterprise Domain Controllers) that real GPMC always shows but never lets you remove. */
  inherited: boolean;
}

/** Individual permission bits shown in real GPMC's "Erweitert..." (Advanced Security Settings) dialog. */
export interface GpoAdvancedRightsFlags {
  read: boolean;
  write: boolean;
  createAllChild: boolean;
  deleteAllChild: boolean;
  applyGroupPolicy: boolean;
}

export interface GpoAdvancedAce extends GpoSecurityPrincipal {
  inherited: boolean;
  allow: GpoAdvancedRightsFlags;
  deny: GpoAdvancedRightsFlags;
}

// --- GPO properties: Details tab ---

export type GpoStatus = "enabled" | "userDisabled" | "computerDisabled" | "allDisabled";

export interface GpoDetails {
  domain: string;
  owner: string;
  gpoStatus: GpoStatus;
  createdTime?: string;
  modifiedTime?: string;
  adVersion: number;
  sysvolVersion: number;
  wmiFilter?: WmiFilterRef;
}

// --- GPO properties: Einstellungen (Settings) tab ---

export interface GpoSettingsCategoryCount {
  name: string;
  count: number;
}

export interface GpoConfiguredAdmxPolicy {
  categoryPath: string;
  policyName: string;
  state: "enabled" | "disabled";
  values?: Record<string, string>;
}

export interface GpoSettingsSummary {
  machine: {
    admxPolicies: GpoConfiguredAdmxPolicy[];
    preferenceCounts: GpoSettingsCategoryCount[];
  };
  user: {
    admxPolicies: GpoConfiguredAdmxPolicy[];
    preferenceCounts: GpoSettingsCategoryCount[];
  };
}

export interface DomainInfo {
  dn: string;
  name: string;
  dnsName: string;
  netbiosName: string;
}

export interface CreateUserRequest {
  parentOuDn: string;
  sAMAccountName: string;
  givenName?: string;
  sn?: string;
  initials?: string;
  fullName?: string;
  userPrincipalName: string;
  password: string;
  enabled: boolean;
  mustChangePasswordAtNextLogon?: boolean;
  passwordNeverExpires?: boolean;
}

export interface CreateGroupRequest {
  parentOuDn: string;
  sAMAccountName: string;
  description?: string;
  groupType: "security" | "distribution";
  groupScope: "domainLocal" | "global" | "universal";
}

export interface CreateOuRequest {
  parentDn: string;
  name: string;
  description?: string;
}

export interface MoveObjectRequest {
  dn: string;
  newParentDn: string;
}

/**
 * Group Policy Preference printer connection items (User Configuration >
 * Preferences > Control Panel Settings > Printers), stored as entries in the
 * GPO's Printers.xml — real Windows has three distinct connection types,
 * each with its own XML element/attribute shape (see [MS-GPPREF]).
 * `action` mirrors the real GPME "Aktion" dropdown/column:
 * Erstellen/Ersetzen/Aktualisieren/Löschen.
 */
interface PrinterPreferenceBase {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  comment?: string;
  location?: string;
  default: boolean;
}

export interface SharedPrinterPreference extends PrinterPreferenceBase {
  connectionType: "shared";
  path: string;
  skipLocal: boolean;
  persistent: boolean;
  deleteAll: boolean;
  deleteMaps: boolean;
  port?: string;
}

export interface LocalPrinterPreference extends PrinterPreferenceBase {
  connectionType: "local";
  name: string;
  port: string;
  path: string;
  deleteAll: boolean;
}

export interface TcpIpPrinterPreference extends PrinterPreferenceBase {
  connectionType: "tcpip";
  ipAddress: string;
  useDNS: boolean;
  localName: string;
  path: string;
  skipLocal: boolean;
  deleteAll: boolean;
}

export type PrinterPreference = SharedPrinterPreference | LocalPrinterPreference | TcpIpPrinterPreference;

export type CreatePrinterPreferenceRequest = Omit<PrinterPreference, "uid" | "order">;
export type UpdatePrinterPreferenceRequest = Omit<PrinterPreference, "uid" | "order">;

/**
 * GPP Registry preference item (Einstellungen > Windows-Einstellungen >
 * Registrierung). Unlike Printers, this preference type applies to both
 * Computer and User configuration — `scope` picks which SYSVOL Registry.xml
 * (and which gPC*ExtensionNames attribute) an item is read from/written to.
 */
export interface RegistryPreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  hive: "HKEY_LOCAL_MACHINE" | "HKEY_CURRENT_USER" | "HKEY_CLASSES_ROOT" | "HKEY_USERS" | "HKEY_CURRENT_CONFIG";
  key: string;
  valueName: string;
  /** REG_DWORD/REG_QWORD values are the decimal number as a string; REG_MULTI_SZ joins lines with "\n". */
  valueType: "REG_SZ" | "REG_EXPAND_SZ" | "REG_BINARY" | "REG_DWORD" | "REG_MULTI_SZ" | "REG_QWORD";
  value: string;
}

export type CreateRegistryPreferenceRequest = Omit<RegistryPreference, "uid" | "order">;
export type UpdateRegistryPreferenceRequest = Omit<RegistryPreference, "uid" | "order">;

/**
 * GPP Drive Map preference item (Benutzerkonfiguration > Einstellungen >
 * Windows-Einstellungen > Laufwerkzuordnungen). User-scope only — network
 * drive mappings only make sense per logged-on user, there is no Computer
 * Configuration equivalent in real GPME. Deliberately has no
 * userName/password fields — see gpp-drivemaps.service.ts's doc comment on
 * why (the MS14-025 "cpassword" vulnerability; real, patched Windows GPME
 * no longer exposes credential fields in this dialog either).
 */
export interface DriveMapPreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  path: string;
  label?: string;
  useLetter: boolean;
  /** Single uppercase drive letter (e.g. "S"), only meaningful when useLetter is true. */
  letter?: string;
  persistent: boolean;
}

export type CreateDriveMapPreferenceRequest = Omit<DriveMapPreference, "uid" | "order">;
export type UpdateDriveMapPreferenceRequest = Omit<DriveMapPreference, "uid" | "order">;

// --- GPP Scheduled Tasks (Geplante Aufgaben, mind. Windows 7 / TaskV2 format) ---
// Applies to both Computer and User configuration, like Registry. Models
// the real embedded Task Scheduler 2.0 XML (per the Win32 Task Scheduler
// Schema), restricted to the trigger/action/setting surface real GPME's own
// "Neue Aufgabe"/"Neuer Trigger"/"Neue Aktion" dialogs actually expose —
// e.g. no ComHandler action (schema-legal, but GPME's UI never offers it).

export type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
export type MonthName =
  | "January"
  | "February"
  | "March"
  | "April"
  | "May"
  | "June"
  | "July"
  | "August"
  | "September"
  | "October"
  | "November"
  | "December";

interface TaskTriggerBase {
  uid: string;
  enabled: boolean;
  /** ISO 8601 local datetime (no timezone), e.g. "2026-07-12T09:00:00". */
  startBoundary?: string;
  endBoundary?: string;
  /** Repetition: re-run the trigger's action every N minutes, optionally for a limited duration. */
  repeatEveryMinutes?: number;
  repeatForMinutes?: number;
  /** Stop this instance of the task if it runs longer than this many minutes (default 3 days if unset). */
  executionTimeLimitMinutes?: number;
}

export type TaskTrigger =
  | (TaskTriggerBase & { type: "time"; randomDelayMinutes?: number })
  | (TaskTriggerBase & { type: "daily"; daysInterval: number })
  | (TaskTriggerBase & { type: "weekly"; weeksInterval: number; daysOfWeek: Weekday[] })
  | (TaskTriggerBase & { type: "monthly"; daysOfMonth: string[]; months: MonthName[] })
  | (TaskTriggerBase & { type: "monthlyDow"; weeks: string[]; daysOfWeek: Weekday[]; months: MonthName[] })
  | (TaskTriggerBase & { type: "logon"; userId?: string; delayMinutes?: number })
  | (TaskTriggerBase & { type: "boot"; delayMinutes?: number })
  | (TaskTriggerBase & { type: "idle" })
  | (TaskTriggerBase & { type: "registration"; delayMinutes?: number })
  | (TaskTriggerBase & {
      type: "sessionStateChange";
      stateChange: "ConsoleConnect" | "ConsoleDisconnect" | "RemoteConnect" | "RemoteDisconnect" | "SessionLock" | "SessionUnlock";
      userId?: string;
    });

export type TaskAction =
  | { uid: string; type: "exec"; command: string; arguments?: string; workingDirectory?: string }
  /** Deprecated in real Windows Task Scheduler (GPME still offers it, with a warning) — kept for parity. */
  | {
      uid: string;
      type: "sendEmail";
      server: string;
      from?: string;
      to?: string;
      cc?: string;
      subject?: string;
      body?: string;
    }
  /** Deprecated in real Windows Task Scheduler (GPME still offers it, with a warning) — kept for parity. */
  | { uid: string; type: "showMessage"; title: string; body: string };

/**
 * Who the task runs as. Deliberately has no password field — see
 * DriveMapPreference's doc comment on why (MS14-025 cpassword). Every
 * option here (SYSTEM/LOCAL SERVICE/NETWORK SERVICE, or "current user")
 * maps to a real GPME choice that needs no stored credential: built-in
 * service accounts use S4U logon, "run only when user is logged on" uses
 * InteractiveToken.
 */
export interface TaskPrincipal {
  account: "SYSTEM" | "LOCAL SERVICE" | "NETWORK SERVICE" | "CURRENT_USER";
  runLevel: "LeastPrivilege" | "HighestAvailable";
}

export interface TaskSettings {
  enabled: boolean;
  hidden: boolean;
  allowStartOnDemand: boolean;
  startWhenAvailable: boolean;
  runOnlyIfNetworkAvailable: boolean;
  disallowStartIfOnBatteries: boolean;
  stopIfGoingOnBatteries: boolean;
  allowHardTerminate: boolean;
  wakeToRun: boolean;
  runOnlyIfIdle: boolean;
  executionTimeLimitMinutes?: number;
  priority: number;
  multipleInstancesPolicy: "Parallel" | "Queue" | "IgnoreNew" | "StopExisting";
  deleteExpiredTaskAfterMinutes?: number;
}

export interface ScheduledTaskPreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  name: string;
  description?: string;
  /** "Sofortige Aufgabe": runs once immediately on the next policy refresh, has no triggers at all. */
  immediate: boolean;
  triggers: TaskTrigger[];
  actions: TaskAction[];
  principal: TaskPrincipal;
  settings: TaskSettings;
}

export type CreateScheduledTaskPreferenceRequest = Omit<ScheduledTaskPreference, "uid" | "order">;
export type UpdateScheduledTaskPreferenceRequest = Omit<ScheduledTaskPreference, "uid" | "order">;

// --- GPP Power Options (Energieoptionen) ---
// User-scope only, like Printers/Drive Maps. Real GPME's "Neu" menu offers
// three distinct, independently-schemed item types (per [MS-GPPREF]
// PowerOptions): a legacy Windows-XP-era system button/lid item
// (GlobalPowerOptions), a legacy named power scheme with AC/DC timeouts
// (PowerScheme), and the modern Vista+ comprehensive power plan
// (GlobalPowerOptionsV2) — modeled here the same way the three Printers
// connection types are, as a discriminated union on `kind`.

interface PowerPreferenceBase {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
}

/** Legacy (Windows XP) system-wide power button/lid behavior. Singleton-ish — real GPME allows only one per GPO. */
export interface GlobalPowerOptionsXpPreference extends PowerPreferenceBase {
  kind: "globalXp";
  showIcon: boolean;
  promptPassword: boolean;
  enableHibernation: boolean;
  closeLid: "NONE" | "STAND_BY" | "HIBERNATE" | "SHUT_DOWN";
  pressPowerBtn: "NONE" | "STAND_BY" | "HIBERNATE" | "SHUT_DOWN";
  pressSleepBtn: "NONE" | "STAND_BY" | "HIBERNATE" | "SHUT_DOWN";
}

/** Legacy (Windows XP) named power scheme — AC/DC timeouts in minutes, 0 = never. */
export interface PowerSchemeXpPreference extends PowerPreferenceBase {
  kind: "schemeXp";
  name: string;
  default: boolean;
  monitorAc: number;
  monitorDc: number;
  hardDiskAc: number;
  hardDiskDc: number;
  standbyAc: number;
  standbyDc: number;
  hibernateAc: number;
  hibernateDc: number;
}

/** Modern (Windows Vista+) comprehensive power plan. AC = plugged in, DC = on battery. */
export interface PowerPlanV2Preference extends PowerPreferenceBase {
  kind: "planV2";
  name: string;
  /** Identifies the plan across saves; real Windows keys plans by a GUID here. */
  nameGuid: string;
  default: boolean;
  requireWakePwdAc: boolean;
  requireWakePwdDc: boolean;
  /** Minutes until the hard disk turns off; 0 = never. */
  turnOffHdAc: number;
  turnOffHdDc: number;
  /** Minutes until sleep; 0 = never. */
  sleepAfterAc: number;
  sleepAfterDc: number;
  allowHybridSleepAc: boolean;
  allowHybridSleepDc: boolean;
  /** Minutes until hibernate; 0 = never. */
  hibernateAc: number;
  hibernateDc: number;
  lidCloseAc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  lidCloseDc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  pbActionAc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  pbActionDc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  strtMenuActionAc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  strtMenuActionDc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  linkPwrMgmtAc: boolean;
  linkPwrMgmtDc: boolean;
  /** Processor throttling, percent (0-100). */
  procStateMinAc: number;
  procStateMinDc: number;
  procStateMaxAc: number;
  procStateMaxDc: number;
  /** Minutes until display turns off; 0 = never. */
  displayOffAc: number;
  displayOffDc: number;
  adaptiveAc: boolean;
  adaptiveDc: boolean;
  critBatActionAc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  critBatActionDc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  /** Battery percent thresholds. */
  lowBatteryLvlAc: number;
  lowBatteryLvlDc: number;
  critBatteryLvlAc: number;
  critBatteryLvlDc: number;
  lowBatteryNotAc: boolean;
  lowBatteryNotDc: boolean;
  lowBatteryActionAc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
  lowBatteryActionDc: "DO_NOTHING" | "SLEEP" | "HIBERNATE" | "SHUT_DOWN";
}

export type PowerOptionsPreference = GlobalPowerOptionsXpPreference | PowerSchemeXpPreference | PowerPlanV2Preference;

export type CreatePowerOptionsPreferenceRequest = Omit<PowerOptionsPreference, "uid" | "order">;
export type UpdatePowerOptionsPreferenceRequest = Omit<PowerOptionsPreference, "uid" | "order">;

// --- GPP Umgebungsvariablen (Environment Variables) ---
// Both Computer + User configuration, like Registry.
export interface EnvironmentVariablePreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  name: string;
  value: string;
  /** Whether this is a per-user (HKCU\Environment) vs system-wide (HKLM\...\Environment) variable — independent of `scope`, matching real GPME's "Benutzervariable"/"Systemvariable" choice being available under either config side. */
  userVariable: boolean;
  /** Append to an existing variable's value instead of replacing it. */
  partial: boolean;
}

export type CreateEnvironmentVariablePreferenceRequest = Omit<EnvironmentVariablePreference, "uid" | "order">;
export type UpdateEnvironmentVariablePreferenceRequest = Omit<EnvironmentVariablePreference, "uid" | "order">;

// --- GPP Verknüpfungen (Shortcuts) ---
// Both Computer + User configuration.
export interface ShortcutPreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  name: string;
  /** Special-folder-prefixed destination folder for the .lnk file, e.g. "%DesktopDir%", "%StartMenuDir%", "%QuickLaunchDir%", "%StartUpDir%", or a literal path. */
  location: string;
  targetPath: string;
  arguments?: string;
  startIn?: string;
  comment?: string;
  iconPath?: string;
  iconIndex?: number;
  /** "" = normal window (real GPME's default/unset value), "3" = maximized, "7" = minimized — matches the native shortcut WindowStyle values. */
  window?: "" | "3" | "7";
}

export type CreateShortcutPreferenceRequest = Omit<ShortcutPreference, "uid" | "order">;
export type UpdateShortcutPreferenceRequest = Omit<ShortcutPreference, "uid" | "order">;

// --- GPP Dateien (Files) ---
// Both Computer + User configuration.
export interface FilePreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  fromPath: string;
  targetPath: string;
  readOnly: boolean;
  archive: boolean;
  hidden: boolean;
  /** Suppress errors when the source is unreadable, instead of failing the whole preference item. */
  suppressErrors: boolean;
}

export type CreateFilePreferenceRequest = Omit<FilePreference, "uid" | "order">;
export type UpdateFilePreferenceRequest = Omit<FilePreference, "uid" | "order">;

// --- GPP Ordner (Folders) ---
// Both Computer + User configuration.
export interface FolderPreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  path: string;
  readOnly: boolean;
  archive: boolean;
  hidden: boolean;
}

export type CreateFolderPreferenceRequest = Omit<FolderPreference, "uid" | "order">;
export type UpdateFolderPreferenceRequest = Omit<FolderPreference, "uid" | "order">;

// --- GPP INI-Dateien (Ini Files) ---
// Both Computer + User configuration. NOTE the real schema's attribute
// names are swapped from what's intuitive: the XML `value` attribute holds
// the INI *key name*, and the XML `property` attribute holds the actual
// data — confirmed against the official [MS-GPPREF] IniFile XML example,
// not guessed. Kept as sensibly-named fields here (`property`/`value`) and
// mapped to the swapped XML attribute names only in the backend service.
export interface IniFilePreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
  path: string;
  section: string;
  /** The INI key name. Leave empty together with `value` to delete the whole section (action=D). */
  property: string;
  /** The INI key's data. */
  value: string;
}

export type CreateIniFilePreferenceRequest = Omit<IniFilePreference, "uid" | "order">;
export type UpdateIniFilePreferenceRequest = Omit<IniFilePreference, "uid" | "order">;

// --- GPP Lokale Benutzer und Gruppen (Local Users and Groups) ---
// Both Computer + User configuration. Deliberately has NO password field —
// the real [MS-GPPREF] schema has a `cpassword` attribute here (this is
// literally the preference type behind the MS14-025 "cpassword"
// vulnerability: a weakly, publicly-keyed AES-encrypted password stored in
// a world-readable SYSVOL file). Real, patched Windows GPME removed the
// password UI for this dialog after the fix; we do the same, matching the
// precedent already set for Drive Maps.

interface LocalUserGroupBase {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  scope: "machine" | "user";
}

export interface LocalUserPreference extends LocalUserGroupBase {
  kind: "user";
  userName: string;
  /** Rename an existing account to this name; leave empty to keep the current name. */
  newName?: string;
  fullName?: string;
  description?: string;
  /** Require the user to change their password at next logon. */
  changeLogon: boolean;
  /** Prevent the user from changing their password. */
  noChange: boolean;
  neverExpires: boolean;
  acctDisabled: boolean;
}

export interface LocalGroupMember {
  name: string;
  action: "ADD" | "REMOVE";
}

export interface LocalGroupPreference extends LocalUserGroupBase {
  kind: "group";
  groupName: string;
  newName?: string;
  description?: string;
  deleteAllUsers: boolean;
  deleteAllGroups: boolean;
  members: LocalGroupMember[];
}

export type LocalUserGroupPreference = LocalUserPreference | LocalGroupPreference;

export type CreateLocalUserGroupPreferenceRequest = Omit<LocalUserGroupPreference, "uid" | "order">;
export type UpdateLocalUserGroupPreferenceRequest = Omit<LocalUserGroupPreference, "uid" | "order">;

// --- GPP Ordneroptionen (Folder Options) ---
// User-scope only, like Printers. Four distinct real-GPME-creatable item
// kinds, per the official [MS-GPPREF] FolderOptions XML example.

interface FolderOptionsBase {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
}

export interface GlobalFolderOptionsXpPreference extends FolderOptionsBase {
  kind: "globalXp";
  noNetCrawling: boolean;
  folderContentsInfoTip: boolean;
  friendlyTree: boolean;
  fullPathAddress: boolean;
  fullPath: boolean;
  disableThumbnailCache: boolean;
  hidden: "HIDE" | "SHOWALL";
  hideFileExt: boolean;
  separateProcess: boolean;
  showSuperHidden: boolean;
  classicViewState: boolean;
  persistBrowsers: boolean;
  showControlPanel: boolean;
  showCompColor: boolean;
  showInfoTip: boolean;
  webViewBarricade: boolean;
  forceGuest: boolean;
}

export interface GlobalFolderOptionsVistaPreference extends FolderOptionsBase {
  kind: "globalVista";
  alwaysShowIcons: boolean;
  alwaysShowMenus: boolean;
  displayIconThumb: boolean;
  displayFileSize: boolean;
  displaySimpleFolders: boolean;
  fullPath: boolean;
  hidden: "HIDE" | "SHOWALL";
  hideFileExt: boolean;
  showSuperHidden: boolean;
  separateProcess: boolean;
  classicViewState: boolean;
  persistBrowsers: boolean;
  showDriveLetter: boolean;
  showCompColor: boolean;
  showInfoTip: boolean;
  showPreviewHandlers: boolean;
  useCheckBoxes: boolean;
  useSharingWizard: boolean;
  listViewTyping: "SELECT" | "TYPE";
}

export interface OpenWithPreference extends FolderOptionsBase {
  kind: "openWith";
  fileExtension: string;
  applicationPath: string;
  default: boolean;
}

export interface FileTypePreference extends FolderOptionsBase {
  kind: "fileType";
  fileExt: string;
  application: string;
  appProgID: string;
  configActions: boolean;
}

export type FolderOptionsPreference =
  | GlobalFolderOptionsXpPreference
  | GlobalFolderOptionsVistaPreference
  | OpenWithPreference
  | FileTypePreference;

export type CreateFolderOptionsPreferenceRequest = Omit<FolderOptionsPreference, "uid" | "order">;
export type UpdateFolderOptionsPreferenceRequest = Omit<FolderOptionsPreference, "uid" | "order">;

// --- GPP Regionale Einstellungen (Regional Options) ---
// User-scope only, like Printers. Single item kind, per the official
// [MS-GPPREF] Regional Options XML example.
export interface RegionalOptionsPreference {
  uid: string;
  order: number;
  localeId: number;
  localeName: string;
  numDeciSymbol: string;
  numNumDecimals: number;
  numGrpSymbol: string;
  numDigitGrpFmt: string;
  numNegSymbol: string;
  numNegFormat: number;
  numLeadingZeros: boolean;
  numListSeparator: string;
  /** 0 = metric, 1 = U.S. */
  numMeasurement: number;
  currSymbol: string;
  currPosFormat: number;
  currNegFormat: number;
  currDeciSymbol: string;
  currNumDecimals: number;
  currGrpSymbol: string;
  currDigitGrpFmt: string;
  timeFormat: string;
  timeSeparator: string;
  timeAmSymbol: string;
  timePmSymbol: string;
  dateInterpretYearMax: number;
  dateShortFormat: string;
  dateSeparator: string;
  dateLongFormat: string;
}

export type CreateRegionalOptionsPreferenceRequest = Omit<RegionalOptionsPreference, "uid" | "order">;
export type UpdateRegionalOptionsPreferenceRequest = Omit<RegionalOptionsPreference, "uid" | "order">;

// --- GPP Startmenü (Start Menu) ---
// User-scope only, like Printers. Two independent singletons (XP and
// Vista+ start menu styles) — like Regional Options, the real [MS-GPPREF]
// StartMenu XML example has no `action` attribute on either Properties
// element, confirming these aren't C/R/U/D list items. The many on/off
// toggles are kept as a `flags` bag keyed by their real XML attribute name
// (rather than ~30 individually-declared boolean fields) to keep this
// manageable while still preserving full fidelity — the backend reads/
// writes each flag by its real name directly.
export interface StartMenuXpPreference {
  uid: string;
  minMFU: number;
  showControlPanel: "LINK" | "MENU" | "0";
  startMenuFavorites: "HIDE" | "SHOW";
  showMyComputer: "LINK" | "MENU" | "0";
  showMyDocs: "LINK" | "MENU" | "0";
  showMyMusic: "LINK" | "MENU" | "0";
  showMyPics: "LINK" | "MENU" | "0";
  showNetConn: "MENU" | "LINK" | "0";
  showRecentDocs: "MENU" | "0" | "1";
  /** Real attribute names as keys, e.g. largeMFUIcons, autoCascade, notifyNewApps, enableDragDrop, showHelp, showNetPlaces, showPrinters, showRun, scrollPrograms, showSearch, clearStartDocsList, cShowLogoff, cShowRun, cEnableDragDrop, cCascadeControlPanel, cCascadeMyDocuments, cCascadeMyPictures, cCascadeNetworkConnections, cCascadePrinters, cScrollPrograms, cPersonalized. */
  flags: Record<string, boolean>;
}

export interface StartMenuVistaPreference {
  uid: string;
  minMFU: number;
  showControlPanel: "LINK" | "MENU" | "0";
  showMyComputer: "LINK" | "MENU" | "0";
  showMyDocs: "LINK" | "MENU" | "0";
  showMyMusic: "LINK" | "MENU" | "0";
  showMyPics: "LINK" | "MENU" | "0";
  showGames: "LINK" | "MENU" | "0";
  personalFolders: "LINK" | "MENU" | "0";
  showRecentDocs: "MENU" | "0" | "1";
  searchFiles: "INDEX" | "NOINDEX";
  systemAdmin: "ALL" | "NONE" | "NORMAL";
  /** Real attribute names as keys, e.g. connectTo, defaultPrograms, enableContextMenu, showFavorites, showHelp, highlightNew, showNetPlaces, openSubMenus, showPrinters, runCommand, showSearch, searchCommunications, searchFavorites, searchPrograms, sortAllPrograms, trackProgs, useLargeIcons, clearStartDocsList, cShowAdminTools, cShowFavorites, cShowLogoff, cShowRun, cEnableDragDrop, cCascadeControlPanel, cCascadeMyDocuments, cCascadeNetworkConnections, cCascadeMyPictures, cCascadePrinters, cScrollPrograms, cSmallIcons, cPersonalized. */
  flags: Record<string, boolean>;
}

// --- GPP Netzwerkoptionen (Network Options) ---
// User-scope only, like Printers. Two distinct real-GPME-creatable item
// kinds (VPN, DUN), per the official [MS-GPPREF] NetworkOptions XML
// example. No credential fields in the real schema — nothing to omit here.

interface NetworkOptionsBase {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  /** Whether this connection is available to all users of the computer, or just the one it was created for. */
  allUsers: boolean;
  name: string;
}

export interface VpnConnectionPreference extends NetworkOptionsBase {
  kind: "vpn";
  ipAddress: string;
  useDNS: boolean;
  dialFirst?: string;
  trayIcon: boolean;
  showProgress: boolean;
  showPassword: boolean;
  showDomain: boolean;
  redialCount: number;
  redialPauseSeconds?: number;
  idleDisconnectMinutes?: number;
  reconnect: boolean;
  customSettings: boolean;
  securePassword: boolean;
  secureData: boolean;
  useLogon: boolean;
  vpnStrategy: "VS_PptpOnly" | "VS_PptpFirst" | "VS_L2tpOnly" | "VS_L2tpFirst" | "VS_Automatic" | "VS_SstpOnly" | "VS_SstpFirst" | "VS_IkeV2Only" | "VS_IkeV2First";
}

export interface DunConnectionPreference extends NetworkOptionsBase {
  kind: "dun";
  phoneNumber: string;
}

export type NetworkOptionsPreference = VpnConnectionPreference | DunConnectionPreference;

export type CreateNetworkOptionsPreferenceRequest = Omit<NetworkOptionsPreference, "uid" | "order">;
export type UpdateNetworkOptionsPreferenceRequest = Omit<NetworkOptionsPreference, "uid" | "order">;

// --- GPP Datenquellen (Data Sources / ODBC) ---
// User-scope only, like Printers. Deliberately has no password field — the
// real [MS-GPPREF] schema has a `cpassword` attribute here too (same
// MS14-025-style AES-with-a-known-key scheme as Drive Maps/Local Users).
export interface DataSourceAttribute {
  name: string;
  value: string;
}

export interface DataSourcePreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  /** True = user DSN (current user only), false = system DSN (all users of the computer). */
  userDSN: boolean;
  dsn: string;
  driver: string;
  description?: string;
  username?: string;
  /** Driver-specific connection attributes, e.g. a file path for file-based drivers like Access ({ name: "DSN", value: "C:\\data.mdb" }). */
  attributes: DataSourceAttribute[];
}

export type CreateDataSourcePreferenceRequest = Omit<DataSourcePreference, "uid" | "order">;
export type UpdateDataSourcePreferenceRequest = Omit<DataSourcePreference, "uid" | "order">;

// --- GPP Geräte (Devices) ---
// Both Computer and User scope, like Registry/ScheduledTasks. Unlike almost every
// other GPP list type, the real [MS-GPPREF] schema has NO "action" (C/R/U/D)
// attribute here at all — "deviceAction" (ENABLE/DISABLE) IS the effect.
export interface DevicePreference {
  uid: string;
  order: number;
  deviceAction: "ENABLE" | "DISABLE";
  /** Display-only description of the device class, e.g. "Floppy drive controllers". */
  deviceClass?: string;
  /** Display-only description of the specific device, e.g. "Standard floppy disk controller". */
  deviceType?: string;
  /** The device setup class GUID, e.g. "{4D36E969-E325-11CE-BFC1-08002BE10318}". */
  deviceClassGUID: string;
  /** The hardware/device instance ID that targets this specific device. */
  deviceTypeID: string;
}

export type CreateDevicePreferenceRequest = Omit<DevicePreference, "uid" | "order">;
export type UpdateDevicePreferenceRequest = Omit<DevicePreference, "uid" | "order">;

// --- GPP Interneteinstellungen (Internet Settings) ---
// Both Computer and User scope, like Registry/Devices. Real GPME's dialog for
// this launches the actual native IE "Internetoptionen" control panel applet
// and diffs the resulting registry changes — there's no bespoke Microsoft
// form to replicate, and the full real schema is a fixed ~100+-entry list of
// named IE registry values (see [MS-GPPREF] InternetSettings XML Example).
// Rather than hardcode that entire fixed catalog, this models it as a raw,
// editable list of named registry entries per settings kind — the same
// approach already used for Data Sources' driver-specific Attributes list —
// which stays byte-correct for real GPME/client processing while keeping the
// UI honest about what it actually is (a raw registry editor for this
// namespace, not a recreation of the native IE Options dialog).
export interface InternetSettingsRegEntry {
  /** Symbolic id Windows uses internally (e.g. "ProxyEnable", "Homepage") — free-form here since we don't hardcode the full real catalog. */
  id: string;
  hive: "HKEY_LOCAL_MACHINE" | "HKEY_CURRENT_USER" | "HKEY_CLASSES_ROOT" | "HKEY_USERS" | "HKEY_CURRENT_CONFIG";
  key: string;
  name: string;
  valueType: "REG_SZ" | "REG_EXPAND_SZ" | "REG_BINARY" | "REG_DWORD" | "REG_MULTI_SZ" | "REG_QWORD";
  /** REG_DWORD/REG_QWORD values are the decimal number as a string; REG_MULTI_SZ joins lines with "\n". */
  value: string;
  /** True = this entry is present but inactive, matching real GPME's per-row checkbox in this dialog. */
  disabled: boolean;
}

export interface InternetSettingsPreference {
  uid: string;
  order: number;
  /** "legacy" = the real "Internet" element ("Internet Explorer 5 and 6"); "modern" = the real "IE7" element ("Internet Explorer 7"). */
  kind: "legacy" | "modern";
  bypassErrors: boolean;
  entries: InternetSettingsRegEntry[];
}

export type CreateInternetSettingsPreferenceRequest = Omit<InternetSettingsPreference, "uid" | "order">;
export type UpdateInternetSettingsPreferenceRequest = Omit<InternetSettingsPreference, "uid" | "order">;

// --- GPP Netzwerkfreigaben (Network Shares) ---
// Computer-scope only, like Drive Maps is user-scope only — shares are a
// machine-level resource with no Computer/User equivalent split in real GPME.
export interface NetworkSharePreference {
  uid: string;
  order: number;
  action: "C" | "R" | "U" | "D";
  name: string;
  path: string;
  comment?: string;
  /** Bulk-target flags used mainly with action D/R: modify/delete all non-hidden, non-special shares. */
  allRegular: boolean;
  /** Modify/delete all hidden shares (name ends in "$"), excluding admin drive shares. */
  allHidden: boolean;
  /** Modify/delete all administrative drive-letter shares (e.g. "C$"). */
  allAdminDrive: boolean;
  limitUsers: "NO_CHANGE" | "SET_LIMIT" | "MAX_ALLOWED";
  /** Only meaningful when limitUsers is "SET_LIMIT". */
  userLimit?: number;
  /** Access-based enumeration: hide folders within the share from users without read access. */
  abe: "NO_CHANGE" | "ENABLE" | "DISABLE";
}

export type CreateNetworkSharePreferenceRequest = Omit<NetworkSharePreference, "uid" | "order">;
export type UpdateNetworkSharePreferenceRequest = Omit<NetworkSharePreference, "uid" | "order">;

// --- GPP Dienste (Services) ---
// Computer-scope only, like Network Shares/Drive Maps — Windows services are
// a machine-level resource, no Computer/User split in real GPME. Deliberately
// has no accountPassword field — the real [MS-GPPREF] schema has a
// `cPassword` attribute here too (same MS14-025-style AES-with-a-known-key
// scheme as Drive Maps/Local Users/Data Sources).
type ServiceFailureAction = "START" | "STOP" | "RESTART" | "NOACTION" | "RESTART_IF_REQUIRED";

export interface ServicePreference {
  uid: string;
  order: number;
  serviceName: string;
  serviceAction: "NOCHANGE" | "START" | "STOP" | "RESTART" | "RESTART_IF_REQUIRED";
  startupType: "NOCHANGE" | "AUTOMATIC" | "BOOT" | "DISABLED" | "MANUAL" | "SYSTEM";
  /** Seconds the preference engine waits to write configuration data if the service is locked. */
  timeout: number;
  /** Logon account for the service, e.g. "LocalSystem" (optional — leaving unset means "don't change"). */
  accountName?: string;
  /** True = allow the service to interact with the desktop. */
  interact: boolean;
  firstFailure: ServiceFailureAction;
  secondFailure: ServiceFailureAction;
  thirdFailure: ServiceFailureAction;
  resetFailCountDelay?: number;
  restartServiceDelay?: number;
  restartComputerDelay?: number;
  restartMessage?: string;
  program?: string;
  args?: string;
  append?: string;
}

export type CreateServicePreferenceRequest = Omit<ServicePreference, "uid" | "order">;
export type UpdateServicePreferenceRequest = Omit<ServicePreference, "uid" | "order">;

// --- Gruppenrichtlinienmodellierung (GPO Modeling / RSoP simulation) ---

/**
 * Computed purely from AD data (OU-chain gPLink/gPOptions precedence, security filtering) —
 * no live client is queried. WMI filters are shown for reference but not evaluated (that needs
 * the actual target machine's WMI data). "Gruppenrichtlinienergebnisse" (live RSoP query against
 * a real reachable client) is a separate, NOT implemented, real-Windows feature — this app has no
 * path to query a remote Windows client's WMI/RSoP data from this Linux-based stack.
 */
export interface RsopGpoEntry {
  guid: string;
  displayName: string;
  sourceDn: string;
  sourceLabel: string;
  enforced: boolean;
  securityFilterPass: boolean;
  wmiFilterName?: string;
  willApply: boolean;
}

export interface RsopResult {
  targetDn: string;
  targetType: "user" | "computer";
  gpos: RsopGpoEntry[];
}

// --- GPO Sichern/Wiederherstellen/Kopieren ---

/**
 * This app's own self-contained backup format (a single JSON manifest embedding the whole SYSVOL
 * tree as base64) — NOT the Microsoft Backup.xml/gpreport.xml format real GPMC produces, so a
 * backup made here can't be imported into real GPMC and vice versa.
 */
export interface GpoBackupManifest {
  formatVersion: 1;
  sourceGuid: string;
  displayName: string;
  sddl: string;
  wmiFilterRaw?: string;
  flags: string;
  backedUpAt: string;
  files: { relativePath: string; contentBase64: string }[];
}

// --- Audit log ---

export interface AuditEntry {
  timestamp: string;
  actor: string;
  operation: string;
  targetDn: string;
  detail?: string;
}

// --- Server health dashboard ---

export interface FsmoRoleHolders {
  schemaMaster: string;
  domainNamingMaster: string;
  pdcEmulator: string;
  ridMaster: string;
  infrastructureMaster: string;
  domainDnsZonesMaster: string;
  forestDnsZonesMaster: string;
}

export interface ReplicationNeighbor {
  direction: "inbound" | "outbound";
  namingContext: string;
  sourceDsa: string;
  lastSuccess?: string;
  consecutiveFailures: number;
  lastError?: string;
}

export interface DiskUsageEntry {
  mount: string;
  sizeGb: number;
  usedGb: number;
  availGb: number;
  usePercent: number;
}

export interface DbcheckResult {
  objectsChecked: number;
  errorCount: number;
  notes: string[];
}

/**
 * Status of this app's own SYSVOL replication loop — Samba has no built-in
 * equivalent of Windows FRS/DFSR, so on a multi-DC domain this in-process
 * background sync is what keeps GPOs and the ADMX Central Store consistent
 * across DCs. "source" = this DC holds the PDC emulator role (the single
 * authoritative copy, nothing to pull); "replica" = this DC periodically
 * pulls from the PDC emulator; "unavailable" = not yet determined (e.g.
 * right after boot, or FSMO lookup failed).
 */
export type SysvolSyncRole = "source" | "replica" | "unavailable";

export interface SysvolSyncStatus {
  role: SysvolSyncRole;
  /** Hostname of the PDC-emulator DC this replica pulls from (only set when role === "replica"). */
  sourceDc?: string;
  lastSyncAt?: string;
  lastSyncOk?: boolean;
  lastError?: string;
}

export interface ServerHealthSummary {
  hostname: string;
  sambaVersion: string;
  uptime: string;
  diskUsage: DiskUsageEntry[];
  fsmoRoles: FsmoRoleHolders;
  replicationNeighbors: ReplicationNeighbor[];
  dbcheck: DbcheckResult;
  timeSyncActive: boolean;
  timeSyncService?: string;
  /** Set when inactive specifically because of a missing container capability (e.g. LXC without CAP_SYS_TIME) rather than a real problem. */
  timeSyncNote?: string;
  samba: { active: boolean };
  sysvolSync: SysvolSyncStatus;
  printSync: PrintSyncStatus;
  generatedAt: string;
}

// --- Gruppenrichtlinien: ADMX-Vorlagen importieren (Chrome, Adobe, ...) ---

export interface AdmxImportResult {
  admxFilesAdded: string[];
  admlFilesAdded: string[];
}

// --- Gruppenrichtlinien: Skripte (Richtlinien > Windows-Einstellungen > Skripte) ---

export type ScriptEvent = "startup" | "shutdown" | "logon" | "logoff";
export type ScriptKind = "script" | "powershell";

export interface GpoScript {
  uid: string;
  order: number;
  event: ScriptEvent;
  kind: ScriptKind;
  fileName: string;
  parameters: string;
  content: string;
}

export type CreateGpoScriptRequest = Omit<GpoScript, "uid" | "order">;
export type UpdateGpoScriptRequest = Omit<GpoScript, "uid" | "order" | "event" | "kind">;
