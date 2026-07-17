import crypto from "node:crypto";
import type ldap from "ldapjs";
import type { GpoConfiguredAdmxPolicy, GpoDetails, GpoSettingsCategoryCount, GpoSettingsSummary, GpoStatus, WmiFilterRef } from "@samba-admin/shared";
import { search, attrString, modify, buildChange, add, del } from "../directory/ldapClient.js";
import { getGpoSetting } from "./gpo-editor.service.js";
import { getGpoSddl, parseSddl, gpoDnOf } from "./gpo-dacl.js";
import { resolvePrincipal } from "./gpo-security.service.js";
import { listPrinterPreferences } from "./gpp-printers.service.js";
import { listRegistryPreferences } from "./gpp-registry.service.js";
import { listDriveMapPreferences } from "./gpp-drivemaps.service.js";
import { listScheduledTaskPreferences } from "./gpp-scheduledtasks.service.js";
import { listPowerOptionsPreferences } from "./gpp-poweroptions.service.js";
import { listEnvironmentVariablePreferences } from "./gpp-envvars.service.js";
import { listShortcutPreferences } from "./gpp-shortcuts.service.js";
import { listFilePreferences } from "./gpp-files.service.js";
import { listFolderPreferences } from "./gpp-folders.service.js";
import { listIniFilePreferences } from "./gpp-inifiles.service.js";
import { listLocalUserGroupPreferences } from "./gpp-localusergroups.service.js";
import { listFolderOptionsPreferences } from "./gpp-folderoptions.service.js";
import { getRegionalOptionsPreference } from "./gpp-regionaloptions.service.js";
import { getStartMenuPreferences } from "./gpp-startmenu.service.js";
import { listNetworkOptionsPreferences } from "./gpp-networkoptions.service.js";
import { listDataSourcePreferences } from "./gpp-datasources.service.js";
import { listDevicePreferences } from "./gpp-devices.service.js";
import { listInternetSettingsPreferences } from "./gpp-internetsettings.service.js";
import { listNetworkSharePreferences } from "./gpp-networkshares.service.js";
import { listServicePreferences } from "./gpp-services.service.js";

function gpoStatusFromFlags(flags: number): GpoStatus {
  switch (flags & 3) {
    case 1:
      return "userDisabled";
    case 2:
      return "computerDisabled";
    case 3:
      return "allDisabled";
    default:
      return "enabled";
  }
}

export async function getGpoDetails(client: ldap.Client, domainDn: string, guid: string): Promise<GpoDetails> {
  const gpoDn = gpoDnOf(domainDn, guid);
  const entries = await search(client, gpoDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["flags", "whenCreated", "whenChanged", "versionNumber", "gPCWQLFilter"],
  });
  const attrs = entries[0]?.attributes ?? {};
  const flags = Number(attrString(attrs, "flags") ?? "0");
  const gpcwqlFilter = attrString(attrs, "gPCWQLFilter");

  const sddl = await getGpoSddl(gpoDn);
  const parsed = parseSddl(sddl);
  const ownerPrincipal = parsed.owner ? await resolvePrincipal(client, domainDn, parsed.owner) : undefined;

  const settings = await getGpoSetting(domainDn, guid);

  const domainMatch = /DC=([^,]+)/.exec(domainDn);

  let wmiFilter: WmiFilterRef | undefined;
  if (gpcwqlFilter) {
    const guidMatch = /\{([0-9A-Fa-f-]+)\}/.exec(gpcwqlFilter);
    if (guidMatch) {
      try {
        const filters = await listWmiFilters(client, domainDn);
        wmiFilter = filters.find((f) => f.dn.toLowerCase().includes(guidMatch[1].toLowerCase()));
      } catch {
        // WMI filter container may not exist on this domain; leave unassigned.
      }
    }
  }

  return {
    domain: domainMatch ? domainMatch[1] : domainDn,
    owner: ownerPrincipal?.name ?? parsed.owner ?? "",
    gpoStatus: gpoStatusFromFlags(flags),
    createdTime: attrString(attrs, "whenCreated"),
    modifiedTime: attrString(attrs, "whenChanged"),
    adVersion: Number(attrString(attrs, "versionNumber") ?? "0"),
    sysvolVersion: settings?.gptVersion ?? 0,
    wmiFilter,
  };
}

export async function setGpoStatus(client: ldap.Client, domainDn: string, guid: string, status: GpoStatus): Promise<void> {
  const flags = { enabled: 0, userDisabled: 1, computerDisabled: 2, allDisabled: 3 }[status];
  await modify(client, gpoDnOf(domainDn, guid), [buildChange("replace", "flags", String(flags))]);
}

/** Read of existing msWMI-Som filter objects — assignment only, no authoring UI (matches the "don't build controls this app can't fully manage" rule already applied to skipping GPP Applications). */
export async function listWmiFilters(client: ldap.Client, domainDn: string): Promise<WmiFilterRef[]> {
  const somDn = `CN=SOM,CN=WMIPolicy,CN=System,${domainDn}`;
  const entries = await search(client, somDn, {
    scope: "one",
    filter: "(objectClass=msWMI-Som)",
    attributes: ["msWMI-Name", "msWMI-Parm1"],
  });
  return entries.map((entry) => ({
    dn: entry.dn,
    name: attrString(entry.attributes, "msWMI-Name") ?? entry.dn,
    description: attrString(entry.attributes, "msWMI-Parm1"),
  }));
}

export async function setGpoWmiFilter(client: ldap.Client, domainDn: string, guid: string, filterDn: string | null): Promise<void> {
  const gpoDn = gpoDnOf(domainDn, guid);
  if (!filterDn) {
    await modify(client, gpoDn, [buildChange("replace", "gPCWQLFilter", "")]);
    return;
  }
  const entries = await search(client, filterDn, { scope: "base", filter: "(objectClass=*)", attributes: ["msWMI-ID"] });
  const filterGuid = attrString(entries[0]?.attributes ?? {}, "msWMI-ID") ?? "";
  await modify(client, gpoDn, [buildChange("replace", "gPCWQLFilter", `[${domainDn};${filterGuid}]`)]);
}

/**
 * Creates a new msWMI-Som filter object. msWMI-Parm2 encodes the WQL query in the documented
 * "<count>;<queryLength>;<namespace>;<query>;" format — this could not be cross-checked against a
 * real GPMC-created sample or a real Windows client in this environment (no existing filter objects
 * on this test domain, no RSAT/GPMC access), so treat the query-evaluation fidelity as unverified
 * even though the object mechanics (creation, listing, assignment) are confirmed working.
 */
export async function createWmiFilter(
  client: ldap.Client,
  domainDn: string,
  name: string,
  description: string,
  query: string,
  namespace = "root\\CIMv2"
): Promise<string> {
  const guid = `{${crypto.randomUUID().toUpperCase()}}`;
  const dn = `CN=${guid},CN=SOM,CN=WMIPolicy,CN=System,${domainDn}`;
  await add(client, dn, {
    objectClass: ["top", "msWMI-Som"],
    "msWMI-Name": name,
    "msWMI-ID": guid,
    "msWMI-Parm1": description,
    "msWMI-Parm2": `1;${query.length};${namespace};${query};`,
  });
  return dn;
}

export async function deleteWmiFilter(client: ldap.Client, dn: string): Promise<void> {
  await del(client, dn);
}

/**
 * Read-only report for the Einstellungen tab. Deliberately shows the raw
 * configured registry key/value/name for ADMX settings (rather than
 * cross-referencing every possible ADMX element definition to produce a
 * fully "friendly" rendering like real GPMC's HTML report) — this keeps the
 * report honest and simple while still surfacing exactly what's configured;
 * GPP preference counts reuse each preference type's already-existing list
 * endpoint rather than a new bespoke aggregation format.
 */
export async function getGpoSettingsSummary(domainDn: string, guid: string): Promise<GpoSettingsSummary> {
  const settings = await getGpoSetting(domainDn, guid);

  function toAdmxPolicies(entries: { key: string; valueName: string; value: string | number | Buffer }[]): GpoConfiguredAdmxPolicy[] {
    return entries.map((e) => ({
      categoryPath: e.key,
      policyName: e.valueName || e.key,
      state: "enabled",
      values: { value: String(e.value) },
    }));
  }

  async function count(name: string, fn: () => Promise<{ length: number } | null>): Promise<GpoSettingsCategoryCount> {
    try {
      const result = await fn();
      return { name, count: result?.length ?? 0 };
    } catch {
      return { name, count: 0 };
    }
  }

  const machinePreferenceCounts = await Promise.all([
    count("Registrierung", () => listRegistryPreferences(domainDn, guid, "machine")),
    count("Geplante Aufgaben", () => listScheduledTaskPreferences(domainDn, guid, "machine")),
    count("Umgebungsvariablen", () => listEnvironmentVariablePreferences(domainDn, guid, "machine")),
    count("Verknüpfungen", () => listShortcutPreferences(domainDn, guid, "machine")),
    count("Dateien", () => listFilePreferences(domainDn, guid, "machine")),
    count("Ordner", () => listFolderPreferences(domainDn, guid, "machine")),
    count("INI-Dateien", () => listIniFilePreferences(domainDn, guid, "machine")),
    count("Lokale Benutzer und Gruppen", () => listLocalUserGroupPreferences(domainDn, guid, "machine")),
    count("Geräte", () => listDevicePreferences(domainDn, guid, "machine")),
    count("Interneteinstellungen", () => listInternetSettingsPreferences(domainDn, guid, "machine")),
    count("Netzwerkfreigaben", () => listNetworkSharePreferences(domainDn, guid)),
    count("Dienste", () => listServicePreferences(domainDn, guid)),
  ]);

  const userPreferenceCounts = await Promise.all([
    count("Registrierung", () => listRegistryPreferences(domainDn, guid, "user")),
    count("Geplante Aufgaben", () => listScheduledTaskPreferences(domainDn, guid, "user")),
    count("Umgebungsvariablen", () => listEnvironmentVariablePreferences(domainDn, guid, "user")),
    count("Verknüpfungen", () => listShortcutPreferences(domainDn, guid, "user")),
    count("Dateien", () => listFilePreferences(domainDn, guid, "user")),
    count("Ordner", () => listFolderPreferences(domainDn, guid, "user")),
    count("INI-Dateien", () => listIniFilePreferences(domainDn, guid, "user")),
    count("Lokale Benutzer und Gruppen", () => listLocalUserGroupPreferences(domainDn, guid, "user")),
    count("Geräte", () => listDevicePreferences(domainDn, guid, "user")),
    count("Interneteinstellungen", () => listInternetSettingsPreferences(domainDn, guid, "user")),
    count("Drucker", () => listPrinterPreferences(domainDn, guid)),
    count("Laufwerkzuordnungen", () => listDriveMapPreferences(domainDn, guid)),
    count("Energieoptionen", () => listPowerOptionsPreferences(domainDn, guid)),
    count("Ordneroptionen", () => listFolderOptionsPreferences(domainDn, guid)),
    count("Netzwerkoptionen", () => listNetworkOptionsPreferences(domainDn, guid)),
    count("Datenquellen", () => listDataSourcePreferences(domainDn, guid)),
    (async (): Promise<GpoSettingsCategoryCount> => ({
      name: "Regionale Einstellungen",
      count: (await getRegionalOptionsPreference(domainDn, guid)) ? 1 : 0,
    }))(),
    (async (): Promise<GpoSettingsCategoryCount> => {
      const startMenu = await getStartMenuPreferences(domainDn, guid);
      return { name: "Startmenü", count: (startMenu.xp ? 1 : 0) + (startMenu.vista ? 1 : 0) };
    })(),
  ]);

  return {
    machine: { admxPolicies: toAdmxPolicies(settings?.machineSettings ?? []), preferenceCounts: machinePreferenceCounts },
    user: { admxPolicies: toAdmxPolicies(settings?.userSettings ?? []), preferenceCounts: userPreferenceCounts },
  };
}
