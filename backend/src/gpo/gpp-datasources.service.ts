import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { DataSourcePreference, DataSourceAttribute } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Data Sources (ODBC) CLSIDs, from [MS-GPPREF] DataSources element table.
const DATASOURCES_CLSID = "{380F820F-F21B-41ac-A3CC-24D4F80F067B}";
const DATASOURCE_ITEM_CLSID = "{5C209626-D820-4d69-8D50-1FACD6214488}";

const DATASOURCES_CSE_GUID = "{728EE579-943C-4519-9EF7-AB56765798ED}";
const DATASOURCES_TOOL_GUID = "{1612b55c-243c-48dd-a449-ffc097b19776}";

function getDataSourcesXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "DataSources", "DataSources.xml");
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

async function ensureDataSourcesCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === DATASOURCES_CSE_GUID.toUpperCase())) return;

  groups.push([DATASOURCES_CSE_GUID, DATASOURCES_TOOL_GUID]);
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

function parseDataSourcesXml(content: string): DataSourcePreference[] {
  const items: DataSourcePreference[] = [];
  let order = 0;

  const elementRe = /<DataSource\b([^>]*)>([\s\S]*?)<\/DataSource>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const uid = (attrs.uid ?? "").replace(/[{}]/g, "");

    const attributes: DataSourceAttribute[] = [];
    const attrsBlockMatch = /<Attributes>([\s\S]*?)<\/Attributes>/.exec(inner);
    if (attrsBlockMatch) {
      const attrRe = /<Attribute\b([^>]*)\/?>/g;
      let am: RegExpExecArray | null;
      while ((am = attrRe.exec(attrsBlockMatch[1])) !== null) {
        const a = extractAttrs(am[1]);
        if (a.name) attributes.push({ name: a.name, value: a.value ?? "" });
      }
    }

    items.push({
      uid,
      order: order++,
      action: (props.action as DataSourcePreference["action"]) ?? "U",
      userDSN: bool(props.userDSN),
      dsn: props.dsn ?? "",
      driver: props.driver ?? "",
      description: props.description || undefined,
      username: props.username || undefined,
      attributes,
    });
  }

  return items;
}

function buildDataSourcesXml(items: DataSourcePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedDsn = escapeXml(item.dsn);
      const attributesXml = item.attributes
        .map((a) => `<Attribute name="${escapeXml(a.name)}" value="${escapeXml(a.value)}"/>`)
        .join("");
      return (
        `<DataSource clsid="${DATASOURCE_ITEM_CLSID}" name="${escapedDsn}" image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" userDSN="${boolAttr(item.userDSN)}" dsn="${escapedDsn}" ` +
        `driver="${escapeXml(item.driver)}" description="${escapeXml(item.description ?? "")}" ` +
        `username="${escapeXml(item.username ?? "")}" cpassword=""/>` +
        `<Attributes>${attributesXml}</Attributes>` +
        `</DataSource>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<DataSources clsid="${DATASOURCES_CLSID}">${body}\r\n</DataSources>\r\n`;
}

export async function listDataSourcePreferences(domainDn: string, guid: string): Promise<DataSourcePreference[]> {
  try {
    const content = await fs.readFile(getDataSourcesXmlPath(domainDn, guid), "utf-8");
    return parseDataSourcesXml(content);
  } catch {
    return [];
  }
}

async function writeDataSourcePreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  items: DataSourcePreference[]
): Promise<void> {
  const xmlPath = getDataSourcesXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildDataSourcesXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensureDataSourcesCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createDataSourcePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<DataSourcePreference, "uid" | "order">
): Promise<DataSourcePreference> {
  const items = await listDataSourcePreferences(domainDn, guid);
  const newItem: DataSourcePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeDataSourcePreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updateDataSourcePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<DataSourcePreference, "uid" | "order">
): Promise<DataSourcePreference> {
  const items = await listDataSourcePreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Datenquelle nicht gefunden.");
  const updated: DataSourcePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeDataSourcePreferences(client, domainDn, guid, items);
  return updated;
}

export async function deleteDataSourcePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string
): Promise<void> {
  const items = await listDataSourcePreferences(domainDn, guid);
  await writeDataSourcePreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
