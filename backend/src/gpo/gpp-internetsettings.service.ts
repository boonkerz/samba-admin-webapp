import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { InternetSettingsPreference, InternetSettingsRegEntry } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Internet Settings CLSIDs, from [MS-GPPREF] InternetSettings XML Example.
// "Internet" = the real "Internet Explorer 5 and 6" legacy item; "IE7" = the
// real "Internet Explorer 7" (modern, still used through current IE/WebView
// registry-compatible settings) item — see gpp-internetsettings.service.ts's
// shared-type doc comment for why this models raw Reg entries instead of the
// full fixed IE Options catalog.
const INTERNETSETTINGS_CLSID = "{B611EB48-F531-42cd-A1F6-5E0D015377BA}";
const LEGACY_ITEM_CLSID = "{8C0FE68F-E8A2-4f17-99E7-C6EFED208917}";
const MODERN_ITEM_CLSID = "{683F7AD7-E782-4232-8A6D-F22431F12DB5}";

const INTERNETSETTINGS_CSE_GUID = "{E47248BA-94CC-49C4-BBB5-9EB7F05183D0}";
const INTERNETSETTINGS_TOOL_GUID = "{5C935941-A954-4F7C-B507-885941ECE5C4}";

type Scope = "machine" | "user";

function getInternetSettingsXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "InternetSettings", "InternetSettings.xml");
}

function extensionAttrForScope(scope: Scope): "gPCMachineExtensionNames" | "gPCUserExtensionNames" {
  return scope === "machine" ? "gPCMachineExtensionNames" : "gPCUserExtensionNames";
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

async function ensureInternetSettingsCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === INTERNETSETTINGS_CSE_GUID.toUpperCase())) return;

  groups.push([INTERNETSETTINGS_CSE_GUID, INTERNETSETTINGS_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", attrName, serializeExtensionGroups(groups))]);
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

function bool(v: string | undefined): boolean {
  return v === "1";
}

function boolAttr(v: boolean): string {
  return v ? "1" : "0";
}

/** REG_DWORD/REG_QWORD are stored as hex in the XML `value` attribute, matching gpp-registry.service.ts's convention. */
function decimalToHex(decimal: string, digits: number): string {
  const n = Number(decimal);
  return (Number.isFinite(n) ? Math.trunc(n) >>> 0 : 0).toString(16).padStart(digits, "0");
}

function hexToDecimal(hex: string): string {
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? String(n) : "0";
}

function encodeValue(type: InternetSettingsRegEntry["valueType"], value: string): string {
  if (type === "REG_DWORD") return decimalToHex(value, 8);
  if (type === "REG_QWORD") return decimalToHex(value, 16);
  if (type === "REG_MULTI_SZ") return value.split("\n").join("\0");
  return value;
}

function decodeValue(type: InternetSettingsRegEntry["valueType"], raw: string): string {
  if (type === "REG_DWORD" || type === "REG_QWORD") return hexToDecimal(raw);
  if (type === "REG_MULTI_SZ") return raw.split("\0").join("\n");
  return raw;
}

function parseRegEntries(propertiesInner: string): InternetSettingsRegEntry[] {
  const entries: InternetSettingsRegEntry[] = [];
  const regRe = /<Reg\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = regRe.exec(propertiesInner)) !== null) {
    const attrs = extractAttrs(m[1]);
    const valueType = (attrs.type || "REG_SZ") as InternetSettingsRegEntry["valueType"];
    entries.push({
      id: attrs.id ?? "",
      hive: (attrs.hive as InternetSettingsRegEntry["hive"]) ?? "HKEY_CURRENT_USER",
      key: attrs.key ?? "",
      name: attrs.name ?? "",
      valueType,
      value: decodeValue(valueType, attrs.value ?? ""),
      disabled: bool(attrs.disabled),
    });
  }
  return entries;
}

function buildRegEntries(entries: InternetSettingsRegEntry[]): string {
  return entries
    .map(
      (e) =>
        `<Reg id="${escapeXml(e.id)}"${e.disabled ? ` disabled="1"` : ""} type="${e.valueType}" hive="${e.hive}" ` +
        `key="${escapeXml(e.key)}" name="${escapeXml(e.name)}" value="${escapeXml(encodeValue(e.valueType, e.value))}"/>`
    )
    .join("");
}

function parseInternetSettingsXml(content: string): InternetSettingsPreference[] {
  const items: InternetSettingsPreference[] = [];
  let order = 0;

  const elementRe = /<(Internet|IE7)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b[^>]*>([\s\S]*?)<\/Properties>/.exec(inner);
    const entries = propsMatch ? parseRegEntries(propsMatch[1]) : [];

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      kind: tag === "Internet" ? "legacy" : "modern",
      bypassErrors: bool(attrs.bypasserrors),
      entries,
    });
  }

  return items;
}

function buildInternetSettingsXml(items: InternetSettingsPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const tag = item.kind === "legacy" ? "Internet" : "IE7";
      const clsid = item.kind === "legacy" ? LEGACY_ITEM_CLSID : MODERN_ITEM_CLSID;
      const name = item.kind === "legacy" ? "Internet Explorer 5 and 6" : "Internet Explorer 7";
      return (
        `<${tag} clsid="${clsid}" name="${name}" status="Internet Settings" changed="${now}" uid="{${item.uid}}" ` +
        `bypasserrors="${boolAttr(item.bypassErrors)}">` +
        `<Properties>${buildRegEntries(item.entries)}</Properties>` +
        `</${tag}>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<InternetSettings clsid="${INTERNETSETTINGS_CLSID}">${body}\r\n</InternetSettings>\r\n`;
}

export async function listInternetSettingsPreferences(domainDn: string, guid: string, scope: Scope): Promise<InternetSettingsPreference[]> {
  try {
    const content = await fs.readFile(getInternetSettingsXmlPath(domainDn, guid, scope), "utf-8");
    return parseInternetSettingsXml(content);
  } catch {
    return [];
  }
}

async function writeInternetSettingsPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: InternetSettingsPreference[]
): Promise<void> {
  const xmlPath = getInternetSettingsXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildInternetSettingsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureInternetSettingsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createInternetSettingsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<InternetSettingsPreference, "uid" | "order">
): Promise<InternetSettingsPreference> {
  const items = await listInternetSettingsPreferences(domainDn, guid, scope);
  const newItem: InternetSettingsPreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeInternetSettingsPreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateInternetSettingsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<InternetSettingsPreference, "uid" | "order">
): Promise<InternetSettingsPreference> {
  const items = await listInternetSettingsPreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Interneteinstellung nicht gefunden.");
  const updated: InternetSettingsPreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeInternetSettingsPreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteInternetSettingsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listInternetSettingsPreferences(domainDn, guid, scope);
  await writeInternetSettingsPreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
