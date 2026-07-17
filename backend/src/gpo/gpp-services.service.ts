import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { ServicePreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Services (NTServices) CLSIDs, from the official [MS-GPPREF] NTServices
// XML example.
const NTSERVICES_CLSID = "{2CFB484A-4E96-4b5d-A0B6-093D2F91E6AE}";
const NTSERVICE_ITEM_CLSID = "{AB6F0B67-341F-4e51-92F9-005FBFBA1A43}";

// CSE + tool extension GUID pair, from [MS-GPPREF]'s Standards Assignments table.
const NTSERVICES_CSE_GUID = "{91FBB303-0CD5-4055-BF42-E512A681B325}";
const NTSERVICES_TOOL_GUID = "{CC5746A9-9B74-4be5-AE2E-64379C86E0E4}";

// Services is a Preferences > Systemsteuerungseinstellungen item under
// Computer Configuration only in real GPME — Windows services are a
// machine-level resource, no User-side equivalent.
function getServicesXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "Machine", "Preferences", "Services", "Services.xml");
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

async function ensureServicesCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["gPCMachineExtensionNames"],
  });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCMachineExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === NTSERVICES_CSE_GUID.toUpperCase())) return;

  groups.push([NTSERVICES_CSE_GUID, NTSERVICES_TOOL_GUID]);
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

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseServicesXml(content: string): ServicePreference[] {
  const items: ServicePreference[] = [];
  let order = 0;

  const elementRe = /<NTService\b([^>]*)>([\s\S]*?)<\/NTService>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      serviceName: props.serviceName ?? "",
      serviceAction: (props.serviceAction as ServicePreference["serviceAction"]) ?? "NOCHANGE",
      startupType: (props.startupType as ServicePreference["startupType"]) ?? "NOCHANGE",
      timeout: num(props.timeout) ?? 30,
      accountName: props.accountName || undefined,
      interact: bool(props.interact),
      firstFailure: (props.firstFailure as ServicePreference["firstFailure"]) ?? "NOACTION",
      secondFailure: (props.secondFailure as ServicePreference["secondFailure"]) ?? "NOACTION",
      thirdFailure: (props.thirdFailure as ServicePreference["thirdFailure"]) ?? "NOACTION",
      resetFailCountDelay: num(props.resetFailCountDelay),
      restartServiceDelay: num(props.restartServiceDelay),
      restartComputerDelay: num(props.restartComputerDelay),
      restartMessage: props.restartMessage || undefined,
      program: props.program || undefined,
      args: props.args || undefined,
      append: props.append || undefined,
    });
  }

  return items;
}

// Matches the [MS-GPPREF] NTServices XML example's attribute set and CLSIDs
// exactly (see module doc comment) — CRLF/compact layout follows the
// established convention for all preference types this session. cPassword is
// always written empty, matching the MS14-025 precedent used throughout.
function buildServicesXml(items: ServicePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedName = escapeXml(item.serviceName);
      return (
        `<NTService clsid="${NTSERVICE_ITEM_CLSID}" name="${escapedName}" image="0" changed="${now}" uid="{${item.uid}}">` +
        `<Properties serviceAction="${item.serviceAction}" startupType="${item.startupType}" serviceName="${escapedName}" ` +
        `timeout="${item.timeout}" accountName="${escapeXml(item.accountName ?? "")}" cPassword="" interact="${boolAttr(item.interact)}" ` +
        `firstFailure="${item.firstFailure}" secondFailure="${item.secondFailure}" thirdFailure="${item.thirdFailure}" ` +
        `resetFailCountDelay="${item.resetFailCountDelay ?? ""}" restartServiceDelay="${item.restartServiceDelay ?? ""}" ` +
        `restartComputerDelay="${item.restartComputerDelay ?? ""}" restartMessage="${escapeXml(item.restartMessage ?? "")}" ` +
        `program="${escapeXml(item.program ?? "")}" args="${escapeXml(item.args ?? "")}" append="${escapeXml(item.append ?? "")}"/>` +
        `</NTService>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<NTServices clsid="${NTSERVICES_CLSID}">${body}\r\n</NTServices>\r\n`;
}

export async function listServicePreferences(domainDn: string, guid: string): Promise<ServicePreference[]> {
  try {
    const content = await fs.readFile(getServicesXmlPath(domainDn, guid), "utf-8");
    return parseServicesXml(content);
  } catch {
    return [];
  }
}

async function writeServicePreferences(client: ldap.Client, domainDn: string, guid: string, items: ServicePreference[]): Promise<void> {
  const xmlPath = getServicesXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildServicesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "machine");
  await ensureServicesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createServicePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<ServicePreference, "uid" | "order">
): Promise<ServicePreference> {
  const items = await listServicePreferences(domainDn, guid);
  const newItem: ServicePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeServicePreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updateServicePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<ServicePreference, "uid" | "order">
): Promise<ServicePreference> {
  const items = await listServicePreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Dienst nicht gefunden.");
  const updated: ServicePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeServicePreferences(client, domainDn, guid, items);
  return updated;
}

export async function deleteServicePreference(client: ldap.Client, domainDn: string, guid: string, uid: string): Promise<void> {
  const items = await listServicePreferences(domainDn, guid);
  await writeServicePreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
