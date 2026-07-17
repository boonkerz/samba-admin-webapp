import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { FilePreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Files CLSIDs + item attribute set, from the official [MS-GPPREF]
// Files XML example.
const FILES_CLSID = "{215B2E53-57CE-475c-80FE-9EEC14635851}";
const FILE_ITEM_CLSID = "{50BE44C8-567A-4ed1-B1D0-9234FE1F38AF}";

const FILES_CSE_GUID = "{7150F9BF-48AD-4da4-A49C-29EF4A8369BA}";
const FILES_TOOL_GUID = "{3BAE7E51-E3F4-41D0-853D-9BB9FD47605F}";

type Scope = "machine" | "user";

function getFilesXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "Files", "Files.xml");
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

async function ensureFilesCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === FILES_CSE_GUID.toUpperCase())) return;

  groups.push([FILES_CSE_GUID, FILES_TOOL_GUID]);
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

function parseFilesXml(content: string, scope: Scope): FilePreference[] {
  const items: FilePreference[] = [];
  let order = 0;

  const elementRe = /<File\b([^>]*)>([\s\S]*?)<\/File>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as FilePreference["action"]) ?? "U",
      scope,
      fromPath: props.fromPath ?? "",
      targetPath: props.targetPath ?? "",
      readOnly: bool(props.readOnly),
      archive: bool(props.archive),
      hidden: bool(props.hidden),
      suppressErrors: bool(props.suppress),
    });
  }

  return items;
}

function buildFilesXml(items: FilePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedTarget = escapeXml(item.targetPath);
      return (
        `<File clsid="${FILE_ITEM_CLSID}" name="${escapedTarget}" status="${escapedTarget}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" fromPath="${escapeXml(item.fromPath)}" targetPath="${escapedTarget}" ` +
        `readOnly="${boolAttr(item.readOnly)}" archive="${boolAttr(item.archive)}" hidden="${boolAttr(item.hidden)}" ` +
        `suppress="${boolAttr(item.suppressErrors)}"/>` +
        `</File>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Files clsid="${FILES_CLSID}">${body}\r\n</Files>\r\n`;
}

export async function listFilePreferences(domainDn: string, guid: string, scope: Scope): Promise<FilePreference[]> {
  try {
    const content = await fs.readFile(getFilesXmlPath(domainDn, guid, scope), "utf-8");
    return parseFilesXml(content, scope);
  } catch {
    return [];
  }
}

async function writeFilePreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: FilePreference[]
): Promise<void> {
  const xmlPath = getFilesXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildFilesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureFilesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createFilePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<FilePreference, "uid" | "order">
): Promise<FilePreference> {
  const items = await listFilePreferences(domainDn, guid, scope);
  const newItem: FilePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeFilePreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateFilePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<FilePreference, "uid" | "order">
): Promise<FilePreference> {
  const items = await listFilePreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Datei nicht gefunden.");
  const updated: FilePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeFilePreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteFilePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listFilePreferences(domainDn, guid, scope);
  await writeFilePreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
