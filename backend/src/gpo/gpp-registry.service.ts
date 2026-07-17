import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { RegistryPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Registry preference CLSIDs, from the official [MS-GPPREF] RegistrySettings
// XML example — not guessed, and cross-checked against the same spec table
// that gave the (already-verified-correct) Printers CSE GUID.
const REGISTRY_SETTINGS_CLSID = "{A3CCFC41-DFDB-43a5-8D26-0FE8B954DA51}";
const REGISTRY_ITEM_CLSID = "{9CD4B2F4-923D-47f5-A062-E897DD1DAD50}";

// CSE + tool extension GUID pair, from [MS-GPPREF]'s Standards Assignments
// table (the same authoritative source used for all other preference
// types this session, rather than the informal web-search process used
// the first time around for Printers).
const REGISTRY_CSE_GUID = "{B087BE9D-ED37-454f-AF9C-04291E351182}";
const REGISTRY_TOOL_GUID = "{BEE07A6A-EC9F-4659-B8C9-0B1937907C83}";

type Scope = "machine" | "user";

function getRegistryXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "Registry", "Registry.xml");
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

/**
 * Registers the Registry CSE in the GPO's scope-appropriate extension-names
 * attribute if it isn't already present — see gpp-printers.service.ts's
 * ensurePrinterCseRegistered for why this is required at all (writing the
 * XML file alone does nothing on a real client without it).
 */
async function ensureRegistryCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: [attrName],
  });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === REGISTRY_CSE_GUID.toUpperCase())) return;

  groups.push([REGISTRY_CSE_GUID, REGISTRY_TOOL_GUID]);
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

/** REG_DWORD/REG_QWORD are stored as zero-padded hex in the XML `value` attribute, not decimal — confirmed against real GPP-authored Registry.xml examples. */
function decimalToHex(decimal: string, digits: number): string {
  const n = Number(decimal);
  return (Number.isFinite(n) ? Math.trunc(n) >>> 0 : 0).toString(16).padStart(digits, "0");
}

function hexToDecimal(hex: string): string {
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? String(n) : "0";
}

/** Encodes our string `value` field into the XML `value` attribute per GPP's per-type convention. */
function encodeValue(type: RegistryPreference["valueType"], value: string): string {
  if (type === "REG_DWORD") return decimalToHex(value, 8);
  if (type === "REG_QWORD") return decimalToHex(value, 16);
  if (type === "REG_MULTI_SZ") return value.split("\n").join("\0");
  return value;
}

/** Inverse of encodeValue, for reading an existing Registry.xml back. */
function decodeValue(type: RegistryPreference["valueType"], raw: string): string {
  if (type === "REG_DWORD" || type === "REG_QWORD") return hexToDecimal(raw);
  if (type === "REG_MULTI_SZ") return raw.split("\0").join("\n");
  return raw;
}

/**
 * Purpose-built reader/writer for this one fixed GPP schema, consistent
 * with how the rest of this codebase hand-rolls small parsers (ADMX,
 * Registry.pol, Printers.xml) rather than pulling in an XML library.
 * Deliberately doesn't parse <Collection> (folder grouping) — this app has
 * no UI for organizing registry items into folders, so a flat item list is
 * all that's read/written, matching the "don't build UI for data we can't
 * actually edit" rule used throughout this project.
 */
function parseRegistryXml(content: string, scope: Scope): RegistryPreference[] {
  const items: RegistryPreference[] = [];
  let order = 0;

  const elementRe = /<Registry\b([^>]*)>([\s\S]*?)<\/Registry>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const valueType = (props.type || "REG_SZ") as RegistryPreference["valueType"];

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as RegistryPreference["action"]) ?? "U",
      scope,
      hive: (props.hive as RegistryPreference["hive"]) ?? "HKEY_LOCAL_MACHINE",
      key: props.key ?? "",
      valueName: props.name ?? "",
      valueType,
      value: decodeValue(valueType, props.value ?? ""),
    });
  }

  return items;
}

// Matches the [MS-GPPREF] RegistrySettings XML example's attribute set and
// CLSIDs exactly (see module doc comment above) — CRLF/compact-layout
// convention follows what a real Windows GPME session was confirmed to
// write for the sibling Printers preference type earlier this session.
function buildRegistryXml(items: RegistryPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const encodedValue = escapeXml(encodeValue(item.valueType, item.value));
      return (
        `<Registry clsid="${REGISTRY_ITEM_CLSID}" name="${escapeXml(item.valueName || item.key)}" ` +
        `status="${escapeXml(item.valueName || item.key)}" image="12" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" displayDecimal="0" default="0" hive="${item.hive}" ` +
        `key="${escapeXml(item.key)}" name="${escapeXml(item.valueName)}" type="${item.valueType}" value="${encodedValue}"/>` +
        `</Registry>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<RegistrySettings clsid="${REGISTRY_SETTINGS_CLSID}">${body}\r\n</RegistrySettings>\r\n`;
}

export async function listRegistryPreferences(domainDn: string, guid: string, scope: Scope): Promise<RegistryPreference[]> {
  try {
    const content = await fs.readFile(getRegistryXmlPath(domainDn, guid, scope), "utf-8");
    return parseRegistryXml(content, scope);
  } catch {
    return [];
  }
}

async function writeRegistryPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: RegistryPreference[]
): Promise<void> {
  const xmlPath = getRegistryXmlPath(domainDn, guid, scope);
  const registryDir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(registryDir).then(
    () => false,
    () => true
  );
  await fs.mkdir(registryDir, { recursive: true });
  await fs.writeFile(xmlPath, buildRegistryXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureRegistryCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createRegistryPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<RegistryPreference, "uid" | "order">
): Promise<RegistryPreference> {
  const items = await listRegistryPreferences(domainDn, guid, scope);
  const newItem: RegistryPreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeRegistryPreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateRegistryPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<RegistryPreference, "uid" | "order">
): Promise<RegistryPreference> {
  const items = await listRegistryPreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Registrierungselement nicht gefunden.");
  const updated: RegistryPreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeRegistryPreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteRegistryPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listRegistryPreferences(domainDn, guid, scope);
  await writeRegistryPreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
