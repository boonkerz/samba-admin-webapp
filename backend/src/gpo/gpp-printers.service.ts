import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { PrinterPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// Group Policy Preferences printer connection CLSIDs — fixed identifiers
// from Microsoft's GPP schema ([MS-GPPREF]), not something we invented; real
// gpedit/GPMC and the client-side extension key off them to tell the three
// connection types apart. PRINTERS_CLSID (the root <Printers> wrapper) was
// captured directly from a file a real Windows GPME session wrote to this
// domain's SYSVOL — more trustworthy than the value memory/docs suggested
// earlier, which turned out not to match what Windows actually writes.
const PRINTERS_CLSID = "{1F577D12-3D1B-471e-A1B7-060317597B9C}";
const SHARED_PRINTER_CLSID = "{9A5E9697-9095-436d-A0EE-4D128FDFBCE5}";
const PORT_PRINTER_CLSID = "{C3A739D2-4A44-401e-9F9D-88E5E77DFB3E}";
const LOCAL_PRINTER_CLSID = "{F08996D5-568B-45f5-BB7A-D3FB1E370B0A}";

// The Printers CSE + its administrative tool extension GUID pair, as it
// appears in a real gPCUserExtensionNames value ([MS-GPOD]). Writing
// Printers.xml to SYSVOL alone does nothing on a real Windows client or in
// gpedit/GPMC — the GPO's extension list is what tells Group Policy this
// GPO has Printers preference data to process/display at all; without it,
// the "Drucker" node under Systemsteuerungseinstellungen simply never shows.
const PRINTERS_CSE_GUID = "{BC75B1ED-5833-4858-9BB8-CBF0B166DF9D}";
const PRINTERS_TOOL_GUID = "{A8C42CEA-CDB8-4388-97F4-5831F933DA84}";

function getPrintersXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "Printers", "Printers.xml");
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
 * Registers the Printers CSE in the GPO's gPCUserExtensionNames attribute if
 * it isn't already present, preserving every other registered extension and
 * keeping the list sorted by CSE GUID (required — see [MS-GPOD] §2.1).
 */
async function ensurePrinterCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["gPCUserExtensionNames"],
  });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === PRINTERS_CSE_GUID.toUpperCase())) return;

  groups.push([PRINTERS_CSE_GUID, PRINTERS_TOOL_GUID]);
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

/**
 * Purpose-built reader/writer for this one fixed GPP schema — consistent
 * with how the rest of this codebase hand-rolls small parsers (ADMX,
 * Registry.pol) rather than pulling in an XML library for a few well-known
 * element shapes.
 */
function parsePrintersXml(content: string): PrinterPreference[] {
  const items: PrinterPreference[] = [];
  let order = 0;

  const elementRe = /<(SharedPrinter|PortPrinter|LocalPrinter)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const base = {
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as PrinterPreference["action"]) ?? "U",
      comment: props.comment || undefined,
      location: props.location || undefined,
      default: bool(props.default),
    };

    if (tag === "SharedPrinter") {
      items.push({
        ...base,
        connectionType: "shared",
        path: props.path ?? "",
        skipLocal: bool(props.skipLocal),
        persistent: bool(props.persistent),
        deleteAll: bool(props.deleteAll),
        deleteMaps: bool(props.deleteMaps),
        port: props.port || undefined,
      });
    } else if (tag === "PortPrinter") {
      items.push({
        ...base,
        connectionType: "tcpip",
        ipAddress: props.ipAddress ?? "",
        useDNS: bool(props.useDNS),
        localName: props.localName ?? "",
        path: props.path ?? "",
        skipLocal: bool(props.skipLocal),
        deleteAll: bool(props.deleteAll),
      });
    } else {
      items.push({
        ...base,
        connectionType: "local",
        name: props.name ?? "",
        port: props.port ?? "",
        path: props.path ?? "",
        deleteAll: bool(props.deleteAll),
      });
    }
  }

  return items;
}

// Matches the exact byte-for-byte shape (attribute set, CRLF line endings,
// no indentation/whitespace between elements) of a file a real Windows
// GPME session wrote for a TCP/IP printer to this domain's SYSVOL. Earlier
// attempts to fill in "typical" extra attributes (bypassErrors/disabled/
// removePolicy, LPR/SNMP port properties) from summarized documentation
// turned out not to match what Windows actually writes — GPME omits them
// entirely for a plain connection with no item-level targeting/port config,
// so we do too rather than invent values we have no UI to actually control.
function buildPrintersXml(items: PrinterPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      if (item.connectionType === "shared") {
        const escapedPath = escapeXml(item.path);
        return (
          `<SharedPrinter clsid="${SHARED_PRINTER_CLSID}" name="${escapedPath}" status="${escapedPath}" ` +
          `image="2" changed="${now}" uid="{${item.uid}}">` +
          `<Properties action="${item.action}" comment="${escapeXml(item.comment ?? "")}" path="${escapedPath}" ` +
          `location="${escapeXml(item.location ?? "")}" default="${boolAttr(item.default)}" skipLocal="${boolAttr(item.skipLocal)}" ` +
          `deleteAll="${boolAttr(item.deleteAll)}" persistent="${boolAttr(item.persistent)}" deleteMaps="${boolAttr(item.deleteMaps)}" ` +
          `port="${escapeXml(item.port ?? "")}"/>` +
          `</SharedPrinter>`
        );
      }
      if (item.connectionType === "tcpip") {
        const escapedName = escapeXml(item.localName);
        return (
          `<PortPrinter clsid="${PORT_PRINTER_CLSID}" name="${escapeXml(item.ipAddress)}" status="${escapeXml(item.ipAddress)}" ` +
          `image="2" changed="${now}" uid="{${item.uid}}">` +
          `<Properties ipAddress="${escapeXml(item.ipAddress)}" action="${item.action}" location="${escapeXml(item.location ?? "")}" ` +
          `localName="${escapedName}" comment="${escapeXml(item.comment ?? "")}" default="${boolAttr(item.default)}" ` +
          `skipLocal="${boolAttr(item.skipLocal)}" useDNS="${boolAttr(item.useDNS)}" useIPv6="0" path="${escapeXml(item.path)}" ` +
          `deleteAll="${boolAttr(item.deleteAll)}"/>` +
          `</PortPrinter>`
        );
      }
      const escapedName = escapeXml(item.name);
      return (
        `<LocalPrinter clsid="${LOCAL_PRINTER_CLSID}" name="${escapedName}" status="${escapeXml(item.location ?? "")}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" name="${escapedName}" port="${escapeXml(item.port)}" path="${escapeXml(item.path)}" ` +
        `default="${boolAttr(item.default)}" deleteAll="${boolAttr(item.deleteAll)}" location="${escapeXml(item.location ?? "")}" ` +
        `comment="${escapeXml(item.comment ?? "")}"/>` +
        `</LocalPrinter>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Printers clsid="${PRINTERS_CLSID}">${body}\r\n</Printers>\r\n`;
}

export async function listPrinterPreferences(domainDn: string, guid: string): Promise<PrinterPreference[]> {
  try {
    const content = await fs.readFile(getPrintersXmlPath(domainDn, guid), "utf-8");
    return parsePrintersXml(content);
  } catch {
    return [];
  }
}

async function writePrinterPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  items: PrinterPreference[]
): Promise<void> {
  const xmlPath = getPrintersXmlPath(domainDn, guid);
  const printersDir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(printersDir).then(
    () => false,
    () => true
  );
  await fs.mkdir(printersDir, { recursive: true });
  await fs.writeFile(xmlPath, buildPrintersXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  // Printer connection preferences are User-scope, same as the GPO version
  // half they need to bump — see bumpGpoVersion's own doc comment for why
  // both GPT.INI and AD's versionNumber attribute must be updated.
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensurePrinterCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createPrinterPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<PrinterPreference, "uid" | "order">
): Promise<PrinterPreference> {
  const items = await listPrinterPreferences(domainDn, guid);
  const newItem = { ...data, uid: crypto.randomUUID(), order: items.length } as PrinterPreference;
  await writePrinterPreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updatePrinterPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<PrinterPreference, "uid" | "order">
): Promise<PrinterPreference> {
  const items = await listPrinterPreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Druckerverbindung nicht gefunden.");
  const updated = { ...data, uid, order: items[idx].order } as PrinterPreference;
  items[idx] = updated;
  await writePrinterPreferences(client, domainDn, guid, items);
  return updated;
}

export async function deletePrinterPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string
): Promise<void> {
  const items = await listPrinterPreferences(domainDn, guid);
  await writePrinterPreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
