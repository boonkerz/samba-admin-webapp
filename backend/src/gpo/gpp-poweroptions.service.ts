import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { PowerOptionsPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Power Options CLSIDs, from the official [MS-GPPREF] PowerOptions XML
// example — covers both the legacy (Windows XP) and modern (Vista+) formats
// real GPME's "Neu" menu still offers today.
const POWEROPTIONS_CLSID = "{7B0F9381-C3B8-4525-8167-87349B671D94}";
const GLOBAL_XP_CLSID = "{46D0DCC4-FC14-48fb-829B-854868C7DC16}";
const SCHEME_XP_CLSID = "{DE828AFA-7E71-480e-8081-5447CBE87754}";
const PLAN_V2_CLSID = "{2B130A62-fc14-4572-91C3-5435C6A0C3FC}";

// CSE + tool extension GUID pair, from [MS-GPPREF]'s Standards Assignments table.
const POWER_CSE_GUID = "{E62688F0-25FD-4c90-BFF5-F508B9D2E31F}";
const POWER_TOOL_GUID = "{9AD2BAFE-63B4-4883-A08C-C3C6196BCAFD}";

// Power Options is a Preferences > Systemsteuerungseinstellungen item under
// User Configuration only in real GPME.
function getPowerOptionsXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "PowerOptions", "PowerOptions.xml");
}

function parseExtensionGroups(value: string): string[][] {
  const groups: string[][] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    groups.push(m[1].match(/\{[0-9A-Fa-f-]+\}/g) ?? []);
  }
  return groups;
}

function serializeExtensionGroups(groups: string[][]): string {
  return groups.map((g) => `[${g.join("")}]`).join("");
}

async function ensurePowerCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === POWER_CSE_GUID.toUpperCase())) return;

  groups.push([POWER_CSE_GUID, POWER_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", "gPCUserExtensionNames", serializeExtensionGroups(groups))]);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

function extractAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) attrs[m[1]] = unescapeXml(m[2]);
  return attrs;
}

function bool01(v: string | undefined): boolean {
  return v === "1";
}

function bool01Attr(v: boolean): string {
  return v ? "1" : "0";
}

function boolYesNo(v: string | undefined): boolean {
  return v === "YES";
}

function boolYesNoAttr(v: boolean): string {
  return v ? "YES" : "NO";
}

function boolOnOff(v: string | undefined): boolean {
  return v === "ON";
}

function boolOnOffAttr(v: boolean): string {
  return v ? "ON" : "OFF";
}

function num(v: string | undefined, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Purpose-built reader/writer, same rationale as the sibling gpp-*.service
 * files. All three item kinds are direct children of the <PowerOptions>
 * root — distinguished by tag name (GlobalPowerOptions / PowerScheme /
 * GlobalPowerOptionsV2), matching real GPME's three creatable item types.
 */
function parsePowerOptionsXml(content: string): PowerOptionsPreference[] {
  const items: PowerOptionsPreference[] = [];
  let order = 0;

  const elementRe = /<(GlobalPowerOptions|PowerScheme|GlobalPowerOptionsV2)\b([^>]*?)(?<!\/)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const uid = (attrs.uid ?? "").replace(/[{}]/g, "");

    if (tag === "GlobalPowerOptions") {
      items.push({
        uid,
        order: order++,
        action: (props.action as PowerOptionsPreference["action"]) ?? "U",
        kind: "globalXp",
        showIcon: bool01(props.showIcon),
        promptPassword: bool01(props.promptPassword),
        enableHibernation: bool01(props.enableHibernation),
        closeLid: (props.closeLid as GlobalXp["closeLid"]) ?? "NONE",
        pressPowerBtn: (props.pressPowerBtn as GlobalXp["pressPowerBtn"]) ?? "NONE",
        pressSleepBtn: (props.pressSleepBtn as GlobalXp["pressSleepBtn"]) ?? "NONE",
      });
    } else if (tag === "PowerScheme") {
      items.push({
        uid,
        order: order++,
        action: (props.action as PowerOptionsPreference["action"]) ?? "U",
        kind: "schemeXp",
        name: props.name ?? attrs.name ?? "",
        default: bool01(props.default),
        monitorAc: num(props.monitorAc),
        monitorDc: num(props.monitorDc),
        hardDiskAc: num(props.hardDiskAc),
        hardDiskDc: num(props.hardDiskDc),
        standbyAc: num(props.standbyAc),
        standbyDc: num(props.standbyDc),
        hibernateAc: num(props.hibernateAc),
        hibernateDc: num(props.hibernateDc),
      });
    } else {
      items.push({
        uid,
        order: order++,
        action: (props.action as PowerOptionsPreference["action"]) ?? "U",
        kind: "planV2",
        name: attrs.name ?? "",
        nameGuid: props.nameGuid ?? `{${crypto.randomUUID().toUpperCase()}}`,
        default: bool01(props.default),
        requireWakePwdAc: boolYesNo(props.requireWakePwdAC),
        requireWakePwdDc: boolYesNo(props.requireWakePwdDC),
        turnOffHdAc: num(props.turnOffHDAC),
        turnOffHdDc: num(props.turnOffHDDC),
        sleepAfterAc: num(props.sleepAfterAC),
        sleepAfterDc: num(props.sleepAfterDC),
        allowHybridSleepAc: boolOnOff(props.allowHybridSleepAC),
        allowHybridSleepDc: boolOnOff(props.allowHybridSleepDC),
        hibernateAc: num(props.hibernateAC),
        hibernateDc: num(props.hibernateDC),
        lidCloseAc: (props.lidCloseAC as PowerActionV2) ?? "DO_NOTHING",
        lidCloseDc: (props.lidCloseDC as PowerActionV2) ?? "DO_NOTHING",
        pbActionAc: (props.pbActionAC as PowerActionV2) ?? "DO_NOTHING",
        pbActionDc: (props.pbActionDC as PowerActionV2) ?? "DO_NOTHING",
        strtMenuActionAc: (props.strtMenuActionAC as PowerActionV2) ?? "DO_NOTHING",
        strtMenuActionDc: (props.strtMenuActionDC as PowerActionV2) ?? "DO_NOTHING",
        linkPwrMgmtAc: boolOnOff(props.linkPwrMgmtAC),
        linkPwrMgmtDc: boolOnOff(props.linkPwrMgmtDC),
        procStateMinAc: num(props.procStateMinAC, 100),
        procStateMinDc: num(props.procStateMinDC, 100),
        procStateMaxAc: num(props.procStateMaxAC, 100),
        procStateMaxDc: num(props.procStateMaxDC, 100),
        displayOffAc: num(props.displayOffAC),
        displayOffDc: num(props.displayOffDC),
        adaptiveAc: boolOnOff(props.adaptiveAC),
        adaptiveDc: boolOnOff(props.adaptiveDC),
        critBatActionAc: (props.critBatActionAC as PowerActionV2) ?? "DO_NOTHING",
        critBatActionDc: (props.critBatActionDC as PowerActionV2) ?? "HIBERNATE",
        lowBatteryLvlAc: num(props.lowBatteryLvlAC, 10),
        lowBatteryLvlDc: num(props.lowBatteryLvlDC, 10),
        critBatteryLvlAc: num(props.critBatteryLvlAC, 5),
        critBatteryLvlDc: num(props.critBatteryLvlDC, 5),
        lowBatteryNotAc: boolOnOff(props.lowBatteryNotAC),
        lowBatteryNotDc: boolOnOff(props.lowBatteryNotDC),
        lowBatteryActionAc: (props.lowBatteryActionAC as PowerActionV2) ?? "DO_NOTHING",
        lowBatteryActionDc: (props.lowBatteryActionDC as PowerActionV2) ?? "DO_NOTHING",
      });
    }
  }

  return items;
}

type GlobalXp = Extract<PowerOptionsPreference, { kind: "globalXp" }>;
type PowerActionV2 = Extract<PowerOptionsPreference, { kind: "planV2" }>["lidCloseAc"];

function buildPowerOptionsXml(items: PowerOptionsPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      if (item.kind === "globalXp") {
        return (
          `<GlobalPowerOptions clsid="${GLOBAL_XP_CLSID}" name="Power Options (Windows XP)" changed="${now}" uid="{${item.uid}}">` +
          `<Properties showIcon="${bool01Attr(item.showIcon)}" promptPassword="${bool01Attr(item.promptPassword)}" ` +
          `enableHibernation="${bool01Attr(item.enableHibernation)}" closeLid="${item.closeLid}" ` +
          `pressPowerBtn="${item.pressPowerBtn}" pressSleepBtn="${item.pressSleepBtn}"/>` +
          `</GlobalPowerOptions>`
        );
      }
      if (item.kind === "schemeXp") {
        const escapedName = escapeXml(item.name);
        return (
          `<PowerScheme clsid="${SCHEME_XP_CLSID}" name="${escapedName}" image="2" changed="${now}" uid="{${item.uid}}">` +
          `<Properties action="${item.action}" name="${escapedName}" default="${bool01Attr(item.default)}" ` +
          `monitorAc="${item.monitorAc}" monitorDc="${item.monitorDc}" hardDiskAc="${item.hardDiskAc}" hardDiskDc="${item.hardDiskDc}" ` +
          `standbyAc="${item.standbyAc}" standbyDc="${item.standbyDc}" hibernateAc="${item.hibernateAc}" hibernateDc="${item.hibernateDc}"/>` +
          `</PowerScheme>`
        );
      }
      const escapedName = escapeXml(item.name);
      return (
        `<GlobalPowerOptionsV2 clsid="${PLAN_V2_CLSID}" name="${escapedName}" image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" nameGuid="${item.nameGuid}" default="${bool01Attr(item.default)}" ` +
        `requireWakePwdAC="${boolYesNoAttr(item.requireWakePwdAc)}" requireWakePwdDC="${boolYesNoAttr(item.requireWakePwdDc)}" ` +
        `turnOffHDAC="${item.turnOffHdAc}" turnOffHDDC="${item.turnOffHdDc}" ` +
        `sleepAfterAC="${item.sleepAfterAc}" sleepAfterDC="${item.sleepAfterDc}" ` +
        `allowHybridSleepAC="${boolOnOffAttr(item.allowHybridSleepAc)}" allowHybridSleepDC="${boolOnOffAttr(item.allowHybridSleepDc)}" ` +
        `hibernateAC="${item.hibernateAc}" hibernateDC="${item.hibernateDc}" ` +
        `lidCloseAC="${item.lidCloseAc}" lidCloseDC="${item.lidCloseDc}" ` +
        `pbActionAC="${item.pbActionAc}" pbActionDC="${item.pbActionDc}" ` +
        `strtMenuActionAC="${item.strtMenuActionAc}" strtMenuActionDC="${item.strtMenuActionDc}" ` +
        `linkPwrMgmtAC="${boolOnOffAttr(item.linkPwrMgmtAc)}" linkPwrMgmtDC="${boolOnOffAttr(item.linkPwrMgmtDc)}" ` +
        `procStateMinAC="${item.procStateMinAc}" procStateMinDC="${item.procStateMinDc}" ` +
        `procStateMaxAC="${item.procStateMaxAc}" procStateMaxDC="${item.procStateMaxDc}" ` +
        `displayOffAC="${item.displayOffAc}" displayOffDC="${item.displayOffDc}" ` +
        `adaptiveAC="${boolOnOffAttr(item.adaptiveAc)}" adaptiveDC="${boolOnOffAttr(item.adaptiveDc)}" ` +
        `critBatActionAC="${item.critBatActionAc}" critBatActionDC="${item.critBatActionDc}" ` +
        `lowBatteryLvlAC="${item.lowBatteryLvlAc}" lowBatteryLvlDC="${item.lowBatteryLvlDc}" ` +
        `critBatteryLvlAC="${item.critBatteryLvlAc}" critBatteryLvlDC="${item.critBatteryLvlDc}" ` +
        `lowBatteryNotAC="${boolOnOffAttr(item.lowBatteryNotAc)}" lowBatteryNotDC="${boolOnOffAttr(item.lowBatteryNotDc)}" ` +
        `lowBatteryActionAC="${item.lowBatteryActionAc}" lowBatteryActionDC="${item.lowBatteryActionDc}"/>` +
        `</GlobalPowerOptionsV2>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<PowerOptions clsid="${POWEROPTIONS_CLSID}">${body}\r\n</PowerOptions>\r\n`;
}

export async function listPowerOptionsPreferences(domainDn: string, guid: string): Promise<PowerOptionsPreference[]> {
  try {
    const content = await fs.readFile(getPowerOptionsXmlPath(domainDn, guid), "utf-8");
    return parsePowerOptionsXml(content);
  } catch {
    return [];
  }
}

async function writePowerOptionsPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  items: PowerOptionsPreference[]
): Promise<void> {
  const xmlPath = getPowerOptionsXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildPowerOptionsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensurePowerCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createPowerOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<PowerOptionsPreference, "uid" | "order">
): Promise<PowerOptionsPreference> {
  const items = await listPowerOptionsPreferences(domainDn, guid);
  const newItem = { ...data, uid: crypto.randomUUID(), order: items.length } as PowerOptionsPreference;
  await writePowerOptionsPreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updatePowerOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<PowerOptionsPreference, "uid" | "order">
): Promise<PowerOptionsPreference> {
  const items = await listPowerOptionsPreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Energieoption nicht gefunden.");
  const updated = { ...data, uid, order: items[idx].order } as PowerOptionsPreference;
  items[idx] = updated;
  await writePowerOptionsPreferences(client, domainDn, guid, items);
  return updated;
}

export async function deletePowerOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string
): Promise<void> {
  const items = await listPowerOptionsPreferences(domainDn, guid);
  await writePowerOptionsPreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
