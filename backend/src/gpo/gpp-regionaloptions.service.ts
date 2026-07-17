import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { RegionalOptionsPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Regional Options CLSIDs, from the official [MS-GPPREF] Regional
// Options XML example. Unlike most preference types, the real schema's
// Properties element has no `action` attribute — this is effectively a
// singleton "set the locale" item, not a C/R/U/D-style list item.
const REGIONAL_CLSID = "{BDBA23C2-DE02-434e-8D89-13E53CB6710B}";
const REGIONALOPTIONS_ITEM_CLSID = "{C126A328-BECF-4acc-BA8D-C9C7F6B84E49}";

const REGIONAL_CSE_GUID = "{E5094040-C46C-4115-B030-04FB2E545B00}";
const REGIONAL_TOOL_GUID = "{B9CCA4DE-E2B9-4CBD-BF7D-11B6EBFBDDF7}";

function getRegionalXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "Regional", "Regional.xml");
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

async function ensureRegionalCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === REGIONAL_CSE_GUID.toUpperCase())) return;

  groups.push([REGIONAL_CSE_GUID, REGIONAL_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", "gPCUserExtensionNames", serializeExtensionGroups(groups))]);
}

/**
 * Unlike list-type preferences (where an empty `<Foo clsid="...">\r\n</Foo>`
 * file is a normal, harmless "nothing configured" state real clients handle
 * fine), Regional Options is a true singleton — there's no valid "empty"
 * shape for it. Leaving its CSE registered in gPCUserExtensionNames with no
 * (or an incomplete) file on disk makes a real Windows client log a
 * processing error for this CSE on every policy refresh, since it expects
 * to find and parse a file whenever the CSE is registered at all.
 */
async function unregisterRegionalCse(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);
  const filtered = groups.filter((g) => g[0]?.toUpperCase() !== REGIONAL_CSE_GUID.toUpperCase());
  if (filtered.length === groups.length) return;
  await modify(client, gpoDn, [buildChange("replace", "gPCUserExtensionNames", serializeExtensionGroups(filtered))]);
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

function num(v: string | undefined, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function parseRegionalXml(content: string): RegionalOptionsPreference | undefined {
  const match = /<RegionalOptions\b([^>]*)>([\s\S]*?)<\/RegionalOptions>/.exec(content);
  if (!match) return undefined;
  const attrs = extractAttrs(match[1]);
  const propsMatch = /<Properties\b([^>]*)\/?>/.exec(match[2]);
  const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

  return {
    uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
    order: 0,
    localeId: num(props.localeId),
    localeName: attrs.name ?? props.localeName ?? "",
    numDeciSymbol: props.numDeciSymbol ?? ".",
    numNumDecimals: num(props.numNumDecimals, 2),
    numGrpSymbol: props.numGrpSymbol ?? ",",
    numDigitGrpFmt: props.numDigitGrpFmt ?? "3;0",
    numNegSymbol: props.numNegSymbol ?? "-",
    numNegFormat: num(props.numNegFormat, 1),
    numLeadingZeros: props.numLeadingZeros === "1",
    numListSeparator: props.numListSeparator ?? ",",
    numMeasurement: num(props.numMeasurement),
    currSymbol: props.currSymbol ?? "",
    currPosFormat: num(props.currPosFormat),
    currNegFormat: num(props.currNegFormat),
    currDeciSymbol: props.currDeciSymbol ?? ".",
    currNumDecimals: num(props.currNumDecimals, 2),
    currGrpSymbol: props.currGrpSymbol ?? ",",
    currDigitGrpFmt: props.currDigitGrpFmt ?? "3;0",
    timeFormat: props.timeFormat ?? "HH:mm:ss",
    timeSeparator: props.timeSeparator ?? ":",
    timeAmSymbol: props.timeAmSymbol ?? "",
    timePmSymbol: props.timePmSymbol ?? "",
    dateInterpretYearMax: num(props.dateInterpretYearMax, 2029),
    dateShortFormat: props.dateShortFormat ?? "dd.MM.yyyy",
    dateSeparator: props.dateSeparator ?? ".",
    dateLongFormat: props.dateLongFormat ?? "dddd, d. MMMM yyyy",
  };
}

function buildRegionalXml(item: RegionalOptionsPreference): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const escapedName = escapeXml(item.localeName);

  const body =
    `<RegionalOptions clsid="${REGIONALOPTIONS_ITEM_CLSID}" name="${escapedName}" changed="${now}" uid="{${item.uid}}">` +
    `<Properties localeId="${item.localeId}" localeName="${escapedName}" numDeciSymbol="${escapeXml(item.numDeciSymbol)}" ` +
    `numNumDecimals="${item.numNumDecimals}" numGrpSymbol="${escapeXml(item.numGrpSymbol)}" numDigitGrpFmt="${escapeXml(item.numDigitGrpFmt)}" ` +
    `numNegSymbol="${escapeXml(item.numNegSymbol)}" numNegFormat="${item.numNegFormat}" numLeadingZeros="${item.numLeadingZeros ? "1" : "0"}" ` +
    `numListSeparator="${escapeXml(item.numListSeparator)}" numMeasurement="${item.numMeasurement}" currSymbol="${escapeXml(item.currSymbol)}" ` +
    `currPosFormat="${item.currPosFormat}" currNegFormat="${item.currNegFormat}" currDeciSymbol="${escapeXml(item.currDeciSymbol)}" ` +
    `currNumDecimals="${item.currNumDecimals}" currGrpSymbol="${escapeXml(item.currGrpSymbol)}" currDigitGrpFmt="${escapeXml(item.currDigitGrpFmt)}" ` +
    `timeFormat="${escapeXml(item.timeFormat)}" timeSeparator="${escapeXml(item.timeSeparator)}" timeAmSymbol="${escapeXml(item.timeAmSymbol)}" ` +
    `timePmSymbol="${escapeXml(item.timePmSymbol)}" dateInterpretYearMax="${item.dateInterpretYearMax}" ` +
    `dateShortFormat="${escapeXml(item.dateShortFormat)}" dateSeparator="${escapeXml(item.dateSeparator)}" ` +
    `dateLongFormat="${escapeXml(item.dateLongFormat)}"/>` +
    `</RegionalOptions>`;

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Regional clsid="${REGIONAL_CLSID}">${body}\r\n</Regional>\r\n`;
}

export async function getRegionalOptionsPreference(domainDn: string, guid: string): Promise<RegionalOptionsPreference | undefined> {
  try {
    const content = await fs.readFile(getRegionalXmlPath(domainDn, guid), "utf-8");
    return parseRegionalXml(content);
  } catch {
    return undefined;
  }
}

export async function setRegionalOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<RegionalOptionsPreference, "uid" | "order">
): Promise<RegionalOptionsPreference> {
  const existing = await getRegionalOptionsPreference(domainDn, guid);
  const item: RegionalOptionsPreference = { ...data, uid: existing?.uid ?? crypto.randomUUID(), order: 0 };

  const xmlPath = getRegionalXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildRegionalXml(item));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensureRegionalCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);

  return item;
}

export async function deleteRegionalOptionsPreference(client: ldap.Client, domainDn: string, guid: string): Promise<void> {
  const xmlPath = getRegionalXmlPath(domainDn, guid);
  await fs.rm(xmlPath, { force: true });
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await unregisterRegionalCse(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}
