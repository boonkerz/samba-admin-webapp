import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { NetworkOptionsPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Network Options CLSIDs, from the official [MS-GPPREF] NetworkOptions
// XML example.
const NETWORKOPTIONS_CLSID = "{09686AD1-5D80-48ee-A940-690A6DF02A90}";
const VPN_ITEM_CLSID = "{0532F359-3205-4d32-ADB7-9AEC6402BECF}";
const DUN_ITEM_CLSID = "{9B0D030D-9396-49c1-8DEF-08B35B5BB79E}";

const NETWORKOPTIONS_CSE_GUID = "{3A0DBA37-F8B2-4356-83DE-3E90BD5C261F}";
const NETWORKOPTIONS_TOOL_GUID = "{949FB894-E883-42C6-88C1-29169720E8CA}";

function getNetworkOptionsXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "NetworkOptions", "NetworkOptions.xml");
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

async function ensureNetworkOptionsCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === NETWORKOPTIONS_CSE_GUID.toUpperCase())) return;

  groups.push([NETWORKOPTIONS_CSE_GUID, NETWORKOPTIONS_TOOL_GUID]);
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

function bool(v: string | undefined): boolean {
  return v === "1";
}

function boolAttr(v: boolean): string {
  return v ? "1" : "0";
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseNetworkOptionsXml(content: string): NetworkOptionsPreference[] {
  const items: NetworkOptionsPreference[] = [];
  let order = 0;

  const elementRe = /<(VPN|DUN)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const uid = (attrs.uid ?? "").replace(/[{}]/g, "");
    const action = (props.action as NetworkOptionsPreference["action"]) ?? "U";
    const allUsers = !bool(props.user); // schema's "user" attr: 1 = this user only, 0 = all users

    if (tag === "VPN") {
      items.push({
        uid,
        order: order++,
        action,
        allUsers,
        name: props.name ?? "",
        kind: "vpn",
        ipAddress: props.ipAddress ?? "",
        useDNS: bool(props.useDNS),
        dialFirst: props.dialFirst || undefined,
        trayIcon: bool(props.trayIcon),
        showProgress: bool(props.showProgress),
        showPassword: bool(props.showPassword),
        showDomain: bool(props.showDomain),
        redialCount: num(props.redialCount) ?? 0,
        redialPauseSeconds: num(props.redialPause),
        idleDisconnectMinutes: num(props.idleDisconnect),
        reconnect: bool(props.reconnect),
        customSettings: bool(props.customSettings),
        securePassword: bool(props.securePassword),
        secureData: bool(props.secureData),
        useLogon: bool(props.useLogon),
        vpnStrategy: (props.vpnStrategy as VpnStrategy) ?? "VS_PptpOnly",
      });
    } else {
      items.push({
        uid,
        order: order++,
        action,
        allUsers,
        name: props.name ?? "",
        kind: "dun",
        phoneNumber: props.phoneNumber ?? "",
      });
    }
  }

  return items;
}

type VpnStrategy = Extract<NetworkOptionsPreference, { kind: "vpn" }>["vpnStrategy"];

function buildNetworkOptionsXml(items: NetworkOptionsPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedName = escapeXml(item.name);
      const userAttr = boolAttr(!item.allUsers);
      if (item.kind === "vpn") {
        return (
          `<VPN clsid="${VPN_ITEM_CLSID}" name="${escapedName}" image="2" userContext="0" removePolicy="0" changed="${now}" uid="{${item.uid}}">` +
          `<Properties action="${item.action}" user="${userAttr}" name="${escapedName}" ipAddress="${escapeXml(item.ipAddress)}" ` +
          `useDNS="${boolAttr(item.useDNS)}" dialFirst="${escapeXml(item.dialFirst ?? "")}" trayIcon="${boolAttr(item.trayIcon)}" ` +
          `showProgress="${boolAttr(item.showProgress)}" showPassword="${boolAttr(item.showPassword)}" showDomain="${boolAttr(item.showDomain)}" ` +
          `redialCount="${item.redialCount}" redialPause="${item.redialPauseSeconds ?? ""}" idleDisconnect="${item.idleDisconnectMinutes ?? ""}" ` +
          `reconnect="${boolAttr(item.reconnect)}" customSettings="${boolAttr(item.customSettings)}" securePassword="${boolAttr(item.securePassword)}" ` +
          `secureData="${boolAttr(item.secureData)}" useLogon="${boolAttr(item.useLogon)}" vpnStrategy="${item.vpnStrategy}"/>` +
          `</VPN>`
        );
      }
      return (
        `<DUN clsid="${DUN_ITEM_CLSID}" name="${escapedName}" image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" user="${userAttr}" name="${escapedName}" phoneNumber="${escapeXml(item.phoneNumber)}"/>` +
        `</DUN>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<NetworkOptions clsid="${NETWORKOPTIONS_CLSID}">${body}\r\n</NetworkOptions>\r\n`;
}

export async function listNetworkOptionsPreferences(domainDn: string, guid: string): Promise<NetworkOptionsPreference[]> {
  try {
    const content = await fs.readFile(getNetworkOptionsXmlPath(domainDn, guid), "utf-8");
    return parseNetworkOptionsXml(content);
  } catch {
    return [];
  }
}

async function writeNetworkOptionsPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  items: NetworkOptionsPreference[]
): Promise<void> {
  const xmlPath = getNetworkOptionsXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildNetworkOptionsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensureNetworkOptionsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createNetworkOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<NetworkOptionsPreference, "uid" | "order">
): Promise<NetworkOptionsPreference> {
  const items = await listNetworkOptionsPreferences(domainDn, guid);
  const newItem = { ...data, uid: crypto.randomUUID(), order: items.length } as NetworkOptionsPreference;
  await writeNetworkOptionsPreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updateNetworkOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<NetworkOptionsPreference, "uid" | "order">
): Promise<NetworkOptionsPreference> {
  const items = await listNetworkOptionsPreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Netzwerkoption nicht gefunden.");
  const updated = { ...data, uid, order: items[idx].order } as NetworkOptionsPreference;
  items[idx] = updated;
  await writeNetworkOptionsPreferences(client, domainDn, guid, items);
  return updated;
}

export async function deleteNetworkOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string
): Promise<void> {
  const items = await listNetworkOptionsPreferences(domainDn, guid);
  await writeNetworkOptionsPreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
