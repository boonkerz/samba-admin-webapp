import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { LocalUserGroupPreference, LocalGroupMember } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Local Users and Groups CLSIDs + item attribute set, from the official
// [MS-GPPREF] Local Users and Groups example — the preference type behind
// the MS14-025 "cpassword" vulnerability. See the shared type's doc comment
// for why this service never reads or writes a password/cpassword field.
const GROUPS_CLSID = "{3125E937-EB16-4b4c-9934-544FC6D24D26}";
const USER_ITEM_CLSID = "{DF5F1855-51E5-4d24-8B1A-D9BDE98BA1D1}";
const GROUP_ITEM_CLSID = "{6D4A79E4-529C-4481-ABD0-F5BD7EA93BA7}";

const GROUPS_CSE_GUID = "{17D89FEC-5C44-4972-B12D-241CAEF74509}";
const GROUPS_TOOL_GUID = "{79F92669-4224-476c-9C5C-6EFB4D87DF4A}";

type Scope = "machine" | "user";

function getGroupsXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "Groups", "Groups.xml");
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

async function ensureGroupsCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === GROUPS_CSE_GUID.toUpperCase())) return;

  groups.push([GROUPS_CSE_GUID, GROUPS_TOOL_GUID]);
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

function parseMembers(inner: string): LocalGroupMember[] {
  const membersEl = /<Members\b[^>]*>([\s\S]*?)<\/Members>/.exec(inner);
  if (!membersEl) return [];
  const members: LocalGroupMember[] = [];
  const re = /<Member\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(membersEl[1])) !== null) {
    const attrs = extractAttrs(m[1]);
    members.push({ name: attrs.name ?? "", action: (attrs.action as LocalGroupMember["action"]) ?? "ADD" });
  }
  return members;
}

function buildMembers(members: LocalGroupMember[]): string {
  if (members.length === 0) return "";
  return `<Members>${members.map((m) => `<Member name="${escapeXml(m.name)}" action="${m.action}" sid=""/>`).join("")}</Members>`;
}

function parseGroupsXml(content: string, scope: Scope): LocalUserGroupPreference[] {
  const items: LocalUserGroupPreference[] = [];
  let order = 0;

  const elementRe = /<(User|Group)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*?)(?<!\/)>([\s\S]*)<\/Properties>|<Properties\b([^>]*)\/>/.exec(inner);
    const propsAttrsText = propsMatch ? propsMatch[1] ?? propsMatch[3] ?? "" : "";
    const props = extractAttrs(propsAttrsText);
    const uid = (attrs.uid ?? "").replace(/[{}]/g, "");

    if (tag === "User") {
      items.push({
        uid,
        order: order++,
        action: (props.action as LocalUserGroupPreference["action"]) ?? "U",
        scope,
        kind: "user",
        userName: props.userName ?? "",
        newName: props.newName || undefined,
        fullName: props.fullName || undefined,
        description: props.description || undefined,
        changeLogon: bool(props.changeLogon),
        noChange: bool(props.noChange),
        neverExpires: bool(props.neverExpires),
        acctDisabled: bool(props.acctDisabled),
      });
    } else {
      items.push({
        uid,
        order: order++,
        action: (props.action as LocalUserGroupPreference["action"]) ?? "U",
        scope,
        kind: "group",
        groupName: props.groupName ?? "",
        newName: props.newName || undefined,
        description: props.description || undefined,
        deleteAllUsers: bool(props.deleteAllUsers),
        deleteAllGroups: bool(props.deleteAllGroups),
        members: parseMembers(inner),
      });
    }
  }

  return items;
}

function buildGroupsXml(items: LocalUserGroupPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      if (item.kind === "user") {
        const escapedName = escapeXml(item.userName);
        return (
          `<User clsid="${USER_ITEM_CLSID}" name="${escapedName}" image="2" changed="${now}" uid="{${item.uid}}">` +
          `<Properties action="${item.action}" newName="${escapeXml(item.newName ?? "")}" fullName="${escapeXml(item.fullName ?? "")}" ` +
          `description="${escapeXml(item.description ?? "")}" cpassword="" changeLogon="${boolAttr(item.changeLogon)}" ` +
          `noChange="${boolAttr(item.noChange)}" neverExpires="${boolAttr(item.neverExpires)}" acctDisabled="${boolAttr(item.acctDisabled)}" ` +
          `userName="${escapedName}"/>` +
          `</User>`
        );
      }
      const escapedName = escapeXml(item.groupName);
      return (
        `<Group clsid="${GROUP_ITEM_CLSID}" name="${escapedName}" image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" newName="${escapeXml(item.newName ?? "")}" description="${escapeXml(item.description ?? "")}" ` +
        `userAction="ADD" deleteAllUsers="${boolAttr(item.deleteAllUsers)}" deleteAllGroups="${boolAttr(item.deleteAllGroups)}" ` +
        `removeAccounts="0" groupName="${escapedName}">${buildMembers(item.members)}</Properties>` +
        `</Group>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<Groups clsid="${GROUPS_CLSID}">${body}\r\n</Groups>\r\n`;
}

export async function listLocalUserGroupPreferences(domainDn: string, guid: string, scope: Scope): Promise<LocalUserGroupPreference[]> {
  try {
    const content = await fs.readFile(getGroupsXmlPath(domainDn, guid, scope), "utf-8");
    return parseGroupsXml(content, scope);
  } catch {
    return [];
  }
}

async function writeLocalUserGroupPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: LocalUserGroupPreference[]
): Promise<void> {
  const xmlPath = getGroupsXmlPath(domainDn, guid, scope);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildGroupsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureGroupsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createLocalUserGroupPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<LocalUserGroupPreference, "uid" | "order">
): Promise<LocalUserGroupPreference> {
  const items = await listLocalUserGroupPreferences(domainDn, guid, scope);
  const newItem = { ...data, uid: crypto.randomUUID(), order: items.length } as LocalUserGroupPreference;
  await writeLocalUserGroupPreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateLocalUserGroupPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<LocalUserGroupPreference, "uid" | "order">
): Promise<LocalUserGroupPreference> {
  const items = await listLocalUserGroupPreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Benutzer/Gruppe nicht gefunden.");
  const updated = { ...data, uid, order: items[idx].order } as LocalUserGroupPreference;
  items[idx] = updated;
  await writeLocalUserGroupPreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteLocalUserGroupPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listLocalUserGroupPreferences(domainDn, guid, scope);
  await writeLocalUserGroupPreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
