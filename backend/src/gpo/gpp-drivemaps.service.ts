import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { DriveMapPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";
import { parseFilters, buildFiltersXml, parseCommonAttrs, buildCommonAttrs, withApplyOnce, hasApplyOnce } from "./gpp-filters.js";

// GPP Drive Maps preference CLSIDs, from the official [MS-GPPREF] Mapped
// Drives XML example.
const DRIVES_CLSID = "{8FDDCC1A-0C3C-43cd-A6B4-71A6DF20DA8C}";
const DRIVE_ITEM_CLSID = "{935D1B74-9CB8-4e3c-9914-7DD559B7A417}";

// CSE + tool extension GUID pair, from [MS-GPPREF]'s Standards Assignments
// table (same authoritative source as Printers/Registry this session).
const DRIVES_CSE_GUID = "{5794DAFD-BE60-433f-88A2-1A31939AC01F}";
const DRIVES_TOOL_GUID = "{2EA1A81B-48E5-45E9-8BB7-A6E3AC170006}";

// Drive Maps is a Preferences > Windows-Einstellungen item under User
// Configuration only in real GPME — there is no Computer-side equivalent
// (network drive mappings only make sense per logged-on user).
function getDrivesXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "Drives", "Drives.xml");
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

async function ensureDrivesCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, {
    scope: "base",
    filter: "(objectClass=*)",
    attributes: ["gPCUserExtensionNames"],
  });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === DRIVES_CSE_GUID.toUpperCase())) return;

  groups.push([DRIVES_CSE_GUID, DRIVES_TOOL_GUID]);
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
 * Purpose-built reader/writer, same rationale as gpp-printers/gpp-registry.
 * Deliberately never reads/writes `userName`/`cpassword` — that's the
 * infamous GPP "cpassword" field (MS14-025): a weakly, publicly-keyed
 * AES-encrypted password stored in a world-readable SYSVOL file. Microsoft
 * removed the credential fields from the real GPME dialog after patching
 * this, so an "exact copy of the Windows tool" must not expose them either.
 */
function parseDrivesXml(content: string): DriveMapPreference[] {
  const items: DriveMapPreference[] = [];
  let order = 0;

  const elementRe = /<Drive\b([^>]*)>([\s\S]*?)<\/Drive>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const filtersMatch = /<Filters>([\s\S]*?)<\/Filters>/.exec(inner);
    const targeting = parseFilters(filtersMatch?.[1]);

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as DriveMapPreference["action"]) ?? "U",
      path: props.path ?? "",
      label: props.label || undefined,
      useLetter: bool(props.useLetter),
      letter: props.letter || undefined,
      persistent: bool(props.persistent),
      common: { ...parseCommonAttrs(attrs), applyOnce: hasApplyOnce(targeting), targeting },
    });
  }

  return items;
}

// Matches the [MS-GPPREF] Mapped Drives XML example's attribute set and
// CLSIDs (see module doc comment) — CRLF/compact layout follows what a real
// Windows GPME session was confirmed to write for Printers earlier this
// session. thisDrive/allDrives are always "NOCHANGE": those two attributes
// drive the "Verbinden als" credential-reconnect radios, which this app
// deliberately has no UI for (see parseDrivesXml's doc comment on cpassword).
function buildDrivesXml(items: DriveMapPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const driveName = item.useLetter && item.letter ? `${item.letter}:` : item.path;
      const targeting = withApplyOnce(item.common.targeting, item.common.applyOnce);
      const commonAttrs = buildCommonAttrs(item.common);
      const commonAttrsStr = Object.entries(commonAttrs)
        .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
        .join("");
      return (
        `<Drive clsid="${DRIVE_ITEM_CLSID}" name="${escapeXml(driveName)}" status="${escapeXml(driveName)}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}"${commonAttrsStr}>` +
        `<Properties action="${item.action}" thisDrive="NOCHANGE" allDrives="NOCHANGE" userName="" cpassword="" ` +
        `path="${escapeXml(item.path)}" label="${escapeXml(item.label ?? "")}" persistent="${boolAttr(item.persistent)}" ` +
        `useLetter="${boolAttr(item.useLetter)}" letter="${escapeXml(item.letter ?? "")}"/>` +
        `${buildFiltersXml(targeting)}` +
        `</Drive>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Drives clsid="${DRIVES_CLSID}">${body}\r\n</Drives>\r\n`;
}

export async function listDriveMapPreferences(domainDn: string, guid: string): Promise<DriveMapPreference[]> {
  try {
    const content = await fs.readFile(getDrivesXmlPath(domainDn, guid), "utf-8");
    return parseDrivesXml(content);
  } catch {
    return [];
  }
}

async function writeDriveMapPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  items: DriveMapPreference[]
): Promise<void> {
  const xmlPath = getDrivesXmlPath(domainDn, guid);
  const drivesDir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(drivesDir).then(
    () => false,
    () => true
  );
  await fs.mkdir(drivesDir, { recursive: true });
  await fs.writeFile(xmlPath, buildDrivesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensureDrivesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createDriveMapPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<DriveMapPreference, "uid" | "order">
): Promise<DriveMapPreference> {
  const items = await listDriveMapPreferences(domainDn, guid);
  const newItem: DriveMapPreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeDriveMapPreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updateDriveMapPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<DriveMapPreference, "uid" | "order">
): Promise<DriveMapPreference> {
  const items = await listDriveMapPreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Laufwerkzuordnung nicht gefunden.");
  const updated: DriveMapPreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeDriveMapPreferences(client, domainDn, guid, items);
  return updated;
}

export async function deleteDriveMapPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string
): Promise<void> {
  const items = await listDriveMapPreferences(domainDn, guid);
  await writeDriveMapPreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
