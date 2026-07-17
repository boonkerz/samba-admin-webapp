import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { DevicePreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Devices CLSIDs, from [MS-GPPREF] Devices Schema. Unlike almost every
// other GPP list type, the Properties element here has NO "action" (C/R/U/D)
// attribute at all — deviceAction (ENABLE/DISABLE) IS the effect.
const DEVICES_CLSID = "{4DD26924-3F32-47aa-BF33-36D51BD1E54E}";
const DEVICE_ITEM_CLSID = "{2E1C95D0-85FB-403a-A57C-A508854FB7C8}";

const DEVICES_CSE_GUID = "{1A6364EB-776B-4120-ADE1-B63A406A76B5}";
const DEVICES_TOOL_GUID = "{1b767e9a-7be4-4d35-85c1-2e174a7ba951}";

type Scope = "machine" | "user";

function getDevicesXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "Devices", "Devices.xml");
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

async function ensureDevicesCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === DEVICES_CSE_GUID.toUpperCase())) return;

  groups.push([DEVICES_CSE_GUID, DEVICES_TOOL_GUID]);
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

function parseDevicesXml(content: string): DevicePreference[] {
  const items: DevicePreference[] = [];
  let order = 0;

  const elementRe = /<Device\b([^>]*)>([\s\S]*?)<\/Device>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      deviceAction: (props.deviceAction as DevicePreference["deviceAction"]) ?? "DISABLE",
      deviceClass: props.deviceClass || undefined,
      deviceType: props.deviceType || undefined,
      deviceClassGUID: props.deviceClassGUID ?? "",
      deviceTypeID: props.deviceTypeID ?? "",
    });
  }

  return items;
}

function buildDevicesXml(items: DevicePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const displayName = item.deviceType || item.deviceClass || "Device";
      return (
        `<Device clsid="${DEVICE_ITEM_CLSID}" name="${escapeXml(displayName)}" image="0" changed="${now}" uid="{${item.uid}}">` +
        `<Properties deviceAction="${item.deviceAction}" deviceClass="${escapeXml(item.deviceClass ?? "")}" ` +
        `deviceType="${escapeXml(item.deviceType ?? "")}" deviceClassGUID="${escapeXml(item.deviceClassGUID)}" ` +
        `deviceTypeID="${escapeXml(item.deviceTypeID)}"/>` +
        `</Device>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Devices clsid="${DEVICES_CLSID}">${body}\r\n</Devices>\r\n`;
}

export async function listDevicePreferences(domainDn: string, guid: string, scope: Scope): Promise<DevicePreference[]> {
  try {
    const content = await fs.readFile(getDevicesXmlPath(domainDn, guid, scope), "utf-8");
    return parseDevicesXml(content);
  } catch {
    return [];
  }
}

async function writeDevicePreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: DevicePreference[]
): Promise<void> {
  const xmlPath = getDevicesXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildDevicesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureDevicesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createDevicePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<DevicePreference, "uid" | "order">
): Promise<DevicePreference> {
  const items = await listDevicePreferences(domainDn, guid, scope);
  const newItem: DevicePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeDevicePreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateDevicePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<DevicePreference, "uid" | "order">
): Promise<DevicePreference> {
  const items = await listDevicePreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Gerät nicht gefunden.");
  const updated: DevicePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeDevicePreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteDevicePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listDevicePreferences(domainDn, guid, scope);
  await writeDevicePreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
