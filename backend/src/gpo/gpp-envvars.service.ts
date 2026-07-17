import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { EnvironmentVariablePreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Environment Variables CLSIDs, from [MS-GPPREF]'s Outer and Inner
// Element Names and CLSIDs table (the same authoritative source used for
// all other preference types this session).
const ENVVARS_CLSID = "{BF141A63-327B-438a-B9BF-2C188F13B7AD}";
const ENVVAR_ITEM_CLSID = "{78570023-8373-4a19-BA80-2F150738EA19}";

const ENVVARS_CSE_GUID = "{0E28E245-9368-4853-AD84-6DA3BA35BB75}";
const ENVVARS_TOOL_GUID = "{35141B6B-498A-4CC7-AD59-CEF93D89B2CE}";

type Scope = "machine" | "user";

function getEnvVarsXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "EnvironmentVariables", "EnvironmentVariables.xml");
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

async function ensureEnvVarsCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === ENVVARS_CSE_GUID.toUpperCase())) return;

  groups.push([ENVVARS_CSE_GUID, ENVVARS_TOOL_GUID]);
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

function parseEnvVarsXml(content: string, scope: Scope): EnvironmentVariablePreference[] {
  const items: EnvironmentVariablePreference[] = [];
  let order = 0;

  const elementRe = /<EnvironmentVariable\b([^>]*)>([\s\S]*?)<\/EnvironmentVariable>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (props.action as EnvironmentVariablePreference["action"]) ?? "U",
      scope,
      name: props.name ?? "",
      value: props.value ?? "",
      userVariable: bool(props.user),
      partial: bool(props.partial),
    });
  }

  return items;
}

function buildEnvVarsXml(items: EnvironmentVariablePreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      const escapedName = escapeXml(item.name);
      return (
        `<EnvironmentVariable clsid="${ENVVAR_ITEM_CLSID}" name="${escapedName}" status="${escapedName}" ` +
        `image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" name="${escapedName}" value="${escapeXml(item.value)}" ` +
        `user="${boolAttr(item.userVariable)}" partial="${boolAttr(item.partial)}"/>` +
        `</EnvironmentVariable>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<EnvironmentVariables clsid="${ENVVARS_CLSID}">${body}\r\n</EnvironmentVariables>\r\n`;
}

export async function listEnvironmentVariablePreferences(domainDn: string, guid: string, scope: Scope): Promise<EnvironmentVariablePreference[]> {
  try {
    const content = await fs.readFile(getEnvVarsXmlPath(domainDn, guid, scope), "utf-8");
    return parseEnvVarsXml(content, scope);
  } catch {
    return [];
  }
}

async function writeEnvironmentVariablePreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: EnvironmentVariablePreference[]
): Promise<void> {
  const xmlPath = getEnvVarsXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildEnvVarsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureEnvVarsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createEnvironmentVariablePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<EnvironmentVariablePreference, "uid" | "order">
): Promise<EnvironmentVariablePreference> {
  const items = await listEnvironmentVariablePreferences(domainDn, guid, scope);
  const newItem: EnvironmentVariablePreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeEnvironmentVariablePreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateEnvironmentVariablePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<EnvironmentVariablePreference, "uid" | "order">
): Promise<EnvironmentVariablePreference> {
  const items = await listEnvironmentVariablePreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Umgebungsvariable nicht gefunden.");
  const updated: EnvironmentVariablePreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeEnvironmentVariablePreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteEnvironmentVariablePreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listEnvironmentVariablePreferences(domainDn, guid, scope);
  await writeEnvironmentVariablePreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
