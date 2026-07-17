import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { IniFilePreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP IniFiles CLSIDs + item attribute set, from the official [MS-GPPREF]
// IniFile XML example. NOTE the real schema's `value`/`property` attributes
// are swapped from what's intuitive — `value` holds the INI key name and
// `property` holds the actual data. Confirmed against the spec's own
// example (key "ALLOWED" -> attribute value="ALLOWED", data "ARTIST" ->
// attribute property="ARTIST"), not guessed.
const INIFILES_CLSID = "{694C651A-08F2-47fa-A427-34C4F62BA207}";
const INI_ITEM_CLSID = "{EEFACE84-D3D8-4680-8D4B-BF103E759448}";

const INIFILES_CSE_GUID = "{74EE6C03-5363-4554-B161-627540339CAB}";
const INIFILES_TOOL_GUID = "{516FC620-5D34-4B08-8165-6A06B623EDEB}";

type Scope = "machine" | "user";

function getIniFilesXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "IniFiles", "IniFiles.xml");
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

async function ensureIniFilesCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === INIFILES_CSE_GUID.toUpperCase())) return;

  groups.push([INIFILES_CSE_GUID, INIFILES_TOOL_GUID]);
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

function parseIniFilesXml(content: string, scope: Scope): IniFilePreference[] {
  const items: IniFilePreference[] = [];
  let order = 0;

  const elementRe = /<Ini\b([^>]*)>([\s\S]*?)<\/Ini>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as IniFilePreference["action"]) ?? "U",
      scope,
      path: props.path ?? "",
      section: props.section ?? "",
      property: props.value ?? "",
      value: props.property ?? "",
    });
  }

  return items;
}

function buildIniFilesXml(items: IniFilePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedValueData = escapeXml(item.value);
      return (
        `<Ini clsid="${INI_ITEM_CLSID}" name="${escapedValueData}" status="${escapedValueData}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties path="${escapeXml(item.path)}" section="${escapeXml(item.section)}" ` +
        `value="${escapeXml(item.property)}" property="${escapedValueData}" action="${item.action}"/>` +
        `</Ini>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<IniFiles clsid="${INIFILES_CLSID}">${body}\r\n</IniFiles>\r\n`;
}

export async function listIniFilePreferences(domainDn: string, guid: string, scope: Scope): Promise<IniFilePreference[]> {
  try {
    const content = await fs.readFile(getIniFilesXmlPath(domainDn, guid, scope), "utf-8");
    return parseIniFilesXml(content, scope);
  } catch {
    return [];
  }
}

async function writeIniFilePreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: IniFilePreference[]
): Promise<void> {
  const xmlPath = getIniFilesXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildIniFilesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureIniFilesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createIniFilePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<IniFilePreference, "uid" | "order">
): Promise<IniFilePreference> {
  const items = await listIniFilePreferences(domainDn, guid, scope);
  const newItem: IniFilePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeIniFilePreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateIniFilePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<IniFilePreference, "uid" | "order">
): Promise<IniFilePreference> {
  const items = await listIniFilePreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("INI-Eintrag nicht gefunden.");
  const updated: IniFilePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeIniFilePreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteIniFilePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listIniFilePreferences(domainDn, guid, scope);
  await writeIniFilePreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
