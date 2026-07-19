/**
 * Group Policy Preferences "Common" tab (the "Gemeinsame Optionen"/"Common
 * Options" tab every GPP item has) and Item-Level Targeting. Schema verified
 * against Microsoft's own published protocol documentation ([MS-GPPREF]:
 * Common XML Schema and Targeting sections) rather than guessed from memory
 * — attribute names/types/enums here are authoritative, not approximated.
 *
 * Common item XML attributes (siblings of <Properties>/<Filters> on the
 * item element itself): clsid, image, changed, uid, name, status are
 * already handled per-preference-type elsewhere in this app; this file only
 * covers the ones actually surfaced on the Common tab:
 *   bypassErrors  -> NOT stopOnError (unchecked/default = bypass errors and
 *                    continue; checked = stop on error, i.e. bypassErrors
 *                    absent/"0")
 *   userContext   -> runInUserContext (only meaningful for Computer
 *                    Configuration preference types that support it)
 *   removePolicy  -> removeWhenNotApplied
 *   desc          -> description
 * "Apply once and do not reapply" is NOT a common attribute at all — it's
 * implemented as a FilterRunOnce entry synthesized into the item's Filters
 * (confirmed: MS-GPPREF's Common Schema has no such attribute, and
 * FilterRunOnce's own id/comments attributes exist specifically for this).
 */
export interface CommonItemOptions {
  stopOnError: boolean;
  runInUserContext: boolean;
  removeWhenNotApplied: boolean;
  applyOnce: boolean;
  description: string;
  targeting: Filter[];
}

export type FilterBoolOp = "AND" | "OR";

export interface FilterBase {
  bool: FilterBoolOp;
  not: boolean;
  hidden?: boolean;
}

export interface FilterSite extends FilterBase {
  kind: "FilterSite";
  name: string;
}

export interface FilterGroup extends FilterBase {
  kind: "FilterGroup";
  name?: string;
  sid?: string;
  userContext?: boolean;
  primaryGroup?: boolean;
  localGroup?: boolean;
}

export interface FilterRunOnce extends FilterBase {
  kind: "FilterRunOnce";
  id: string;
  userContext?: boolean;
  comments?: string;
}

export interface FilterLdap extends FilterBase {
  kind: "FilterLdap";
  searchFilter?: string;
  binding: string;
  variableName?: string;
  attribute?: string;
}

export interface FilterBattery extends FilterBase {
  kind: "FilterBattery";
}

export type FilterComputerNameType = "NETBIOS" | "DNS";

export interface FilterComputer extends FilterBase {
  kind: "FilterComputer";
  type: FilterComputerNameType;
  name: string;
}

export interface FilterCpu extends FilterBase {
  kind: "FilterCpu";
  speedMHz: number;
}

export type FilterDatePeriod = "MONTHLY" | "WEEKLY" | "YEARLY";
export type FilterDateDow = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface FilterDate extends FilterBase {
  kind: "FilterDate";
  period: FilterDatePeriod;
  dow?: FilterDateDow;
  day?: number;
  month?: number;
  year?: number;
}

export type FilterDunType =
  | ""
  | "modem"
  | "isdn"
  | "x25"
  | "vpn"
  | "pad"
  | "GENERIC"
  | "SERIAL"
  | "FRAMERELAY"
  | "ATM"
  | "SONET"
  | "SW56"
  | "IRDA"
  | "PARALLEL"
  | "PPPoE";

export interface FilterDun extends FilterBase {
  kind: "FilterDun";
  type: FilterDunType;
}

export interface FilterDisk extends FilterBase {
  kind: "FilterDisk";
  freeSpace: number;
  drive: string;
}

export interface FilterDomain extends FilterBase {
  kind: "FilterDomain";
  name: string;
  userContext?: boolean;
}

export interface FilterVariable extends FilterBase {
  kind: "FilterVariable";
  variableName: string;
  value?: string;
}

export type FilterFileType = "EXISTS" | "VERSION";

export interface FilterFile extends FilterBase {
  kind: "FilterFile";
  gte?: boolean;
  lte?: boolean;
  min?: string;
  max?: string;
  path: string;
  type?: FilterFileType;
  folder?: boolean;
}

export interface FilterIpRange extends FilterBase {
  kind: "FilterIpRange";
  min: string;
  max: string;
}

export interface FilterLanguage extends FilterBase {
  kind: "FilterLanguage";
  default?: boolean;
  system?: boolean;
  native?: boolean;
  displayName?: string;
  language: number;
  locale: number;
}

export interface FilterMacRange extends FilterBase {
  kind: "FilterMacRange";
  min: string;
  max: string;
}

export type FilterMsiType = "PRODUCT" | "PATCH" | "FILECOMPONENT";
export type FilterMsiSubType = "EXISTS" | "VERSION" | "GET_PROPERTY" | "GET_INFORMATION" | "MATCH_PROPERTY" | "MATCH_INFORMATION";

export interface FilterMsi extends FilterBase {
  kind: "FilterMsi";
  type: FilterMsiType;
  subtype: FilterMsiSubType;
  code?: string;
  item?: string;
  value?: string;
  min?: string;
  max?: string;
  gte?: boolean;
  lte?: boolean;
}

export type FilterOsClass = "NE" | "9X" | "NT";
export type FilterOsVersion =
  | "NE"
  | "95"
  | "98"
  | "ME"
  | "NT"
  | "2K"
  | "XP"
  | "2K3"
  | "2K3R2"
  | "VISTA"
  | "2K8"
  | "WIN7"
  | "2K8R2"
  | "WIN8"
  | "WIN8S"
  | "WINBLUE"
  | "WINBLUESRV"
  | "WINTHRESHOLD"
  | "WINTHRESHOLDSRV";
export type FilterOsType = "NE" | "R2" | "SE" | "WS" | "SV" | "DC" | "PRO" | "PR";
export type FilterOsEdition =
  | "NE"
  | "64EP"
  | "64DC"
  | "AS"
  | "DTC"
  | "EP"
  | "WEB"
  | "64"
  | "HM"
  | "MC"
  | "TPC"
  | "SRV"
  | "STD"
  | "TSE"
  | "SBS"
  | "PRO";
export type FilterOsSp = "NE" | "Gold" | "Service Pack 1" | "Service Pack 2" | "Service Pack 3" | "Service Pack 4" | "Service Pack 5" | "Service Pack 6";

export interface FilterOs extends FilterBase {
  kind: "FilterOs";
  class?: FilterOsClass;
  version?: FilterOsVersion;
  type?: FilterOsType;
  edition?: FilterOsEdition;
  sp?: FilterOsSp;
}

export interface FilterOrgUnit extends FilterBase {
  kind: "FilterOrgUnit";
  name: string;
  userContext?: boolean;
  directMember?: boolean;
}

export interface FilterPcmcia extends FilterBase {
  kind: "FilterPcmcia";
}

export interface FilterPortable extends FilterBase {
  kind: "FilterPortable";
  unknown?: boolean;
  docked?: boolean;
  undocked?: boolean;
}

export interface FilterProcMode extends FilterBase {
  kind: "FilterProcMode";
  synchFore?: boolean;
  asynchFore?: boolean;
  backRefr?: boolean;
  forceRefr?: boolean;
  linkTrns?: boolean;
  noChg?: boolean;
  rsopTrns?: boolean;
  safeBoot?: boolean;
  slowLink?: boolean;
  verbLog?: boolean;
  rsopEnbl?: boolean;
}

export interface FilterRam extends FilterBase {
  kind: "FilterRam";
  totalMB: number;
}

export type FilterRegistryType = "VALUEEXISTS" | "KEYEXISTS" | "MATCHVALUE" | "GETVALUE";
export type FilterRegistrySubType = "EQUALHEX" | "EQUALDEC" | "SUBSTRING" | "VERSION";
export type FilterRegistryValueType = "REG_SZ" | "REG_EXPAND_SZ" | "REG_MULTI_SZ" | "REG_DWORD" | "REG_BINARY" | "";
export type FilterRegistryHive = "HKEY_LOCAL_MACHINE" | "HKEY_CLASSES_ROOT" | "HKEY_CURRENT_USER" | "HKEY_CURRENT_CONFIG" | "HKEY_USERS";

export interface FilterRegistry extends FilterBase {
  kind: "FilterRegistry";
  type?: FilterRegistryType;
  subtype?: FilterRegistrySubType;
  valueName?: string;
  valueType?: FilterRegistryValueType;
  valueData?: string;
  variableName?: string;
  key: string;
  hive?: FilterRegistryHive;
  min?: string;
  max?: string;
  gte?: boolean;
  lte?: boolean;
  version?: string;
}

export type FilterTerminalType = "NE" | "TS" | "CONSOLE";
export type FilterTerminalOption = "APPLICATION" | "PROGRAM" | "CLIENT" | "SESSION" | "DIRECTORY" | "IP";

export interface FilterTerminal extends FilterBase {
  kind: "FilterTerminal";
  type: FilterTerminalType;
  option: FilterTerminalOption;
  value: string;
  min?: string;
  max?: string;
}

export interface FilterTime extends FilterBase {
  kind: "FilterTime";
  begin: string;
  end: string;
}

export interface FilterUser extends FilterBase {
  kind: "FilterUser";
  name?: string;
  sid?: string;
}

export interface FilterWmi extends FilterBase {
  kind: "FilterWmi";
  query: string;
  nameSpace?: string;
  property?: string;
  variableName?: string;
}

/** A nested AND/OR sub-group of filters — lets targeting express e.g. "(Site A OR Site B) AND Security Group X". */
export interface FilterCollection extends FilterBase {
  kind: "FilterCollection";
  name?: string;
  filters: Filter[];
}

export type Filter =
  | FilterSite
  | FilterGroup
  | FilterRunOnce
  | FilterLdap
  | FilterBattery
  | FilterComputer
  | FilterCpu
  | FilterDate
  | FilterDun
  | FilterDisk
  | FilterDomain
  | FilterVariable
  | FilterFile
  | FilterIpRange
  | FilterLanguage
  | FilterMacRange
  | FilterMsi
  | FilterOs
  | FilterOrgUnit
  | FilterPcmcia
  | FilterPortable
  | FilterProcMode
  | FilterRam
  | FilterRegistry
  | FilterTerminal
  | FilterTime
  | FilterUser
  | FilterWmi
  | FilterCollection;

export type FilterKind = Filter["kind"];
