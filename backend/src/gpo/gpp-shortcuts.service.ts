import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { ShortcutPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Shortcuts CLSIDs + item attribute set, from the official [MS-GPPREF]
// Shortcuts XML example.
const SHORTCUTS_CLSID = "{872ECB34-B2EC-401b-A585-D32574AA90EE}";
const SHORTCUT_ITEM_CLSID = "{4F2F7C55-2790-433e-8127-0739D1CFA327}";

const SHORTCUTS_CSE_GUID = "{C418DD9D-0D14-4efb-8FBF-CFE535C8FAC7}";
const SHORTCUTS_TOOL_GUID = "{CEFFA6E2-E3BD-421B-852C-6F6A79A59BC1}";

type Scope = "machine" | "user";

function getShortcutsXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "Shortcuts", "Shortcuts.xml");
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

async function ensureShortcutsCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === SHORTCUTS_CSE_GUID.toUpperCase())) return;

  groups.push([SHORTCUTS_CSE_GUID, SHORTCUTS_TOOL_GUID]);
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

function parseShortcutsXml(content: string, scope: Scope): ShortcutPreference[] {
  const items: ShortcutPreference[] = [];
  let order = 0;

  const elementRe = /<Shortcut\b([^>]*)>([\s\S]*?)<\/Shortcut>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    // shortcutPath is "<location>\<filename>" — split off the location prefix.
    const shortcutPath = props.shortcutPath ?? "";
    const lastSep = shortcutPath.lastIndexOf("\\");
    const location = lastSep >= 0 ? shortcutPath.slice(0, lastSep) : "";

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as ShortcutPreference["action"]) ?? "U",
      scope,
      name: attrs.name ?? "",
      location,
      targetPath: props.targetPath ?? "",
      arguments: props.arguments || undefined,
      startIn: props.startIn || undefined,
      comment: props.comment || undefined,
      iconPath: props.iconPath || undefined,
      iconIndex: props.iconIndex ? Number(props.iconIndex) : undefined,
      window: (props.window as ShortcutPreference["window"]) || "",
    });
  }

  return items;
}

// Matches the [MS-GPPREF] Shortcuts XML example's attribute set exactly
// (targetType is always "FILESYSTEM" — this app has no UI for URL/object
// shortcuts, matching the "don't build controls for data we can't edit"
// rule used throughout this project).
function buildShortcutsXml(items: ShortcutPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedName = escapeXml(item.name);
      const userContext = item.scope === "user" ? "1" : "0";
      return (
        `<Shortcut clsid="${SHORTCUT_ITEM_CLSID}" userContext="${userContext}" name="${escapedName}" status="${escapedName}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties pidl="" targetType="FILESYSTEM" action="${item.action}" comment="${escapeXml(item.comment ?? "")}" ` +
        `shortcutKey="0" startIn="${escapeXml(item.startIn ?? "")}" arguments="${escapeXml(item.arguments ?? "")}" ` +
        `iconIndex="${item.iconIndex ?? 0}" targetPath="${escapeXml(item.targetPath)}" iconPath="${escapeXml(item.iconPath ?? "")}" ` +
        `window="${item.window ?? ""}" shortcutPath="${escapeXml(item.location)}\\${escapedName}"/>` +
        `</Shortcut>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Shortcuts clsid="${SHORTCUTS_CLSID}">${body}\r\n</Shortcuts>\r\n`;
}

export async function listShortcutPreferences(domainDn: string, guid: string, scope: Scope): Promise<ShortcutPreference[]> {
  try {
    const content = await fs.readFile(getShortcutsXmlPath(domainDn, guid, scope), "utf-8");
    return parseShortcutsXml(content, scope);
  } catch {
    return [];
  }
}

async function writeShortcutPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: ShortcutPreference[]
): Promise<void> {
  const xmlPath = getShortcutsXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildShortcutsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureShortcutsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createShortcutPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<ShortcutPreference, "uid" | "order">
): Promise<ShortcutPreference> {
  const items = await listShortcutPreferences(domainDn, guid, scope);
  const newItem: ShortcutPreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeShortcutPreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateShortcutPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<ShortcutPreference, "uid" | "order">
): Promise<ShortcutPreference> {
  const items = await listShortcutPreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Verknüpfung nicht gefunden.");
  const updated: ShortcutPreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeShortcutPreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteShortcutPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listShortcutPreferences(domainDn, guid, scope);
  await writeShortcutPreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
