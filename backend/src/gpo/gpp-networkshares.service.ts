import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { NetworkSharePreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Network Shares CLSIDs, from the official [MS-GPPREF] NetworkShareSettings
// XML example.
const NETWORKSHARES_CLSID = "{520870D8-A6E7-47e8-A8D8-E6A4E76EAEC2}";
const NETSHARE_ITEM_CLSID = "{2888C5E7-94FC-4739-90AA-2C1536D68BC0}";

// CSE + tool extension GUID pair, from [MS-GPPREF]'s Standards Assignments table.
const NETWORKSHARES_CSE_GUID = "{6A4C88C6-C502-4f74-8F60-2CB23EDC24E2}";
const NETWORKSHARES_TOOL_GUID = "{BFCBBEB0-9DF4-4c0c-A728-434EA66A0373}";

// Network Shares is a Preferences > Windows-Einstellungen item under Computer
// Configuration only in real GPME — shares are a machine-level resource, no
// User-side equivalent (mirrors Drive Maps being User-only for the same
// "which config actually applies" reason).
function getNetworkSharesXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "Machine", "Preferences", "NetworkShares", "NetworkShares.xml");
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

async function ensureNetworkSharesCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["gPCMachineExtensionNames"],
  });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCMachineExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === NETWORKSHARES_CSE_GUID.toUpperCase())) return;

  groups.push([NETWORKSHARES_CSE_GUID, NETWORKSHARES_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", "gPCMachineExtensionNames", serializeExtensionGroups(groups))]);
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

function parseNetworkSharesXml(content: string): NetworkSharePreference[] {
  const items: NetworkSharePreference[] = [];
  let order = 0;

  const elementRe = /<NetShare\b([^>]*)>([\s\S]*?)<\/NetShare>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as NetworkSharePreference["action"]) ?? "U",
      name: props.name ?? "",
      path: props.path ?? "",
      comment: props.comment || undefined,
      allRegular: bool(props.allRegular),
      allHidden: bool(props.allHidden),
      allAdminDrive: bool(props.allAdminDrive),
      limitUsers: (props.limitUsers as NetworkSharePreference["limitUsers"]) ?? "NO_CHANGE",
      userLimit: props.userLimit ? Number(props.userLimit) : undefined,
      abe: (props.abe as NetworkSharePreference["abe"]) ?? "NO_CHANGE",
    });
  }

  return items;
}

// Matches the [MS-GPPREF] NetworkShareSettings XML example's attribute set
// and CLSIDs exactly (see module doc comment) — CRLF/compact layout follows
// the established convention for all preference types this session.
function buildNetworkSharesXml(items: NetworkSharePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedName = escapeXml(item.name);
      return (
        `<NetShare clsid="${NETSHARE_ITEM_CLSID}" image="2" name="${escapedName}" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" name="${escapedName}" path="${escapeXml(item.path)}" ` +
        `comment="${escapeXml(item.comment ?? "")}" allRegular="${boolAttr(item.allRegular)}" allHidden="${boolAttr(item.allHidden)}" ` +
        `allAdminDrive="${boolAttr(item.allAdminDrive)}" limitUsers="${item.limitUsers}" ` +
        `userLimit="${item.userLimit ?? ""}" abe="${item.abe}"/>` +
        `</NetShare>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<NetworkShareSettings clsid="${NETWORKSHARES_CLSID}">${body}\r\n</NetworkShareSettings>\r\n`;
}

export async function listNetworkSharePreferences(domainDn: string, guid: string): Promise<NetworkSharePreference[]> {
  try {
    const content = await fs.readFile(getNetworkSharesXmlPath(domainDn, guid), "utf-8");
    return parseNetworkSharesXml(content);
  } catch {
    return [];
  }
}

async function writeNetworkSharePreferences(client: ldap.Client, domainDn: string, guid: string, items: NetworkSharePreference[]): Promise<void> {
  const xmlPath = getNetworkSharesXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildNetworkSharesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "machine");
  await ensureNetworkSharesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createNetworkSharePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<NetworkSharePreference, "uid" | "order">
): Promise<NetworkSharePreference> {
  const items = await listNetworkSharePreferences(domainDn, guid);
  const newItem: NetworkSharePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeNetworkSharePreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updateNetworkSharePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<NetworkSharePreference, "uid" | "order">
): Promise<NetworkSharePreference> {
  const items = await listNetworkSharePreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Netzwerkfreigabe nicht gefunden.");
  const updated: NetworkSharePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeNetworkSharePreferences(client, domainDn, guid, items);
  return updated;
}

export async function deleteNetworkSharePreference(client: ldap.Client, domainDn: string, guid: string, uid: string): Promise<void> {
  const items = await listNetworkSharePreferences(domainDn, guid);
  await writeNetworkSharePreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
