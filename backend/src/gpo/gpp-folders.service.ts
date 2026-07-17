import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { FolderPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Folders CLSIDs + item attribute set, from the official [MS-GPPREF]
// Folders XML example.
const FOLDERS_CLSID = "{77CC39E7-3D16-4f8f-AF86-EC0BBEE2C861}";
const FOLDER_ITEM_CLSID = "{07DA02F5-F9CD-4397-A550-4AE21B6B4BD3}";

const FOLDERS_CSE_GUID = "{6232C319-91AC-4931-9385-E70C2B099F0E}";
const FOLDERS_TOOL_GUID = "{3EC4E9D3-714D-471F-88DC-4DD4471AAB47}";

type Scope = "machine" | "user";

function getFoldersXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "Folders", "Folders.xml");
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

async function ensureFoldersCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === FOLDERS_CSE_GUID.toUpperCase())) return;

  groups.push([FOLDERS_CSE_GUID, FOLDERS_TOOL_GUID]);
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

function parseFoldersXml(content: string, scope: Scope): FolderPreference[] {
  const items: FolderPreference[] = [];
  let order = 0;

  const elementRe = /<Folder\b([^>]*)>([\s\S]*?)<\/Folder>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as FolderPreference["action"]) ?? "U",
      scope,
      path: props.path ?? "",
      readOnly: bool(props.readOnly),
      archive: bool(props.archive),
      hidden: bool(props.hidden),
    });
  }

  return items;
}

function buildFoldersXml(items: FolderPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedPath = escapeXml(item.path);
      return (
        `<Folder clsid="${FOLDER_ITEM_CLSID}" name="${escapedPath}" status="${escapedPath}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" path="${escapedPath}" readOnly="${boolAttr(item.readOnly)}" ` +
        `archive="${boolAttr(item.archive)}" hidden="${boolAttr(item.hidden)}"/>` +
        `</Folder>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Folders clsid="${FOLDERS_CLSID}">${body}\r\n</Folders>\r\n`;
}

export async function listFolderPreferences(domainDn: string, guid: string, scope: Scope): Promise<FolderPreference[]> {
  try {
    const content = await fs.readFile(getFoldersXmlPath(domainDn, guid, scope), "utf-8");
    return parseFoldersXml(content, scope);
  } catch {
    return [];
  }
}

async function writeFolderPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: FolderPreference[]
): Promise<void> {
  const xmlPath = getFoldersXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildFoldersXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureFoldersCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createFolderPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<FolderPreference, "uid" | "order">
): Promise<FolderPreference> {
  const items = await listFolderPreferences(domainDn, guid, scope);
  const newItem: FolderPreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeFolderPreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateFolderPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<FolderPreference, "uid" | "order">
): Promise<FolderPreference> {
  const items = await listFolderPreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Ordner nicht gefunden.");
  const updated: FolderPreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeFolderPreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteFolderPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listFolderPreferences(domainDn, guid, scope);
  await writeFolderPreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
