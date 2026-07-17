import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { StartMenuXpPreference, StartMenuVistaPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Start Menu CLSIDs, from the official [MS-GPPREF] StartMenu XML
// example. Both StartMenu (XP) and StartMenuVista are singletons — no
// `action` attribute appears on either Properties element in the real
// example, unlike list-style preference types.
const STARTMENUTASKBAR_CLSID = "{4C4059E4-2F6E-4630-9CB8-5D9A89252C3B}";
const STARTMENU_XP_CLSID = "{F722CC65-E38A-496b-BA76-49EBF9571415}";
const STARTMENU_VISTA_CLSID = "{8B03851A-1210-4621-80B6-C334A4F1C941}";

const STARTMENU_CSE_GUID = "{E4F48E54-F38D-4884-BFB9-D4D2E5729C18}";
const STARTMENU_TOOL_GUID = "{CF848D48-888D-4F45-B530-6A201E62A605}";

const XP_FLAG_NAMES = [
  "largeMFUIcons", "autoCascade", "notifyNewApps", "enableDragDrop", "showHelp", "showNetPlaces",
  "showPrinters", "showRun", "scrollPrograms", "showSearch", "clearStartDocsList", "cShowLogoff",
  "cShowRun", "cEnableDragDrop", "cCascadeControlPanel", "cCascadeMyDocuments", "cCascadeMyPictures",
  "cCascadeNetworkConnections", "cCascadePrinters", "cScrollPrograms", "cPersonalized",
]; // prettier-ignore

const VISTA_FLAG_NAMES = [
  "connectTo", "defaultPrograms", "enableContextMenu", "showFavorites", "showHelp", "highlightNew",
  "showNetPlaces", "openSubMenus", "showPrinters", "runCommand", "showSearch", "searchCommunications",
  "searchFavorites", "searchPrograms", "sortAllPrograms", "trackProgs", "useLargeIcons",
  "clearStartDocsList", "cShowAdminTools", "cShowFavorites", "cShowLogoff", "cShowRun",
  "cEnableDragDrop", "cCascadeControlPanel", "cCascadeMyDocuments", "cCascadeNetworkConnections",
  "cCascadeMyPictures", "cCascadePrinters", "cScrollPrograms", "cSmallIcons", "cPersonalized",
]; // prettier-ignore

function getStartMenuXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "StartMenu", "StartMenu.xml");
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

async function ensureStartMenuCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === STARTMENU_CSE_GUID.toUpperCase())) return;

  groups.push([STARTMENU_CSE_GUID, STARTMENU_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", "gPCUserExtensionNames", serializeExtensionGroups(groups))]);
}

/**
 * Start Menu is two true singletons (XP/Vista), not a list — there's no
 * valid "empty" shape for the wrapper once both are unset. Leaving the CSE
 * registered with an empty/missing file makes a real Windows client log a
 * processing error for this CSE on every policy refresh.
 */
async function unregisterStartMenuCse(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);
  const filtered = groups.filter((g) => g[0]?.toUpperCase() !== STARTMENU_CSE_GUID.toUpperCase());
  if (filtered.length === groups.length) return;
  await modify(client, gpoDn, [buildChange("replace", "gPCUserExtensionNames", serializeExtensionGroups(filtered))]);
}

function extractAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function bool(v: string | undefined): boolean {
  return v === "1";
}

function boolAttr(v: boolean): string {
  return v ? "1" : "0";
}

function buildFlagsAttrs(names: string[], flags: Record<string, boolean>): string {
  return names.map((n) => `${n}="${boolAttr(flags[n] ?? false)}"`).join(" ");
}

function parseFlags(names: string[], props: Record<string, string>): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const n of names) flags[n] = bool(props[n]);
  return flags;
}

interface StartMenuData {
  xp?: StartMenuXpPreference;
  vista?: StartMenuVistaPreference;
}

function parseStartMenuXml(content: string): StartMenuData {
  const result: StartMenuData = {};

  const xpMatch = /<StartMenu\b([^>]*)>([\s\S]*?)<\/StartMenu>/.exec(content);
  if (xpMatch) {
    const attrs = extractAttrs(xpMatch[1]);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(xpMatch[2]);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    result.xp = {
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      minMFU: Number(props.minMFU ?? "6"),
      showControlPanel: (props.showControlPanel as StartMenuXpPreference["showControlPanel"]) ?? "LINK",
      startMenuFavorites: (props.startMenuFavorites as StartMenuXpPreference["startMenuFavorites"]) ?? "SHOW",
      showMyComputer: (props.showMyComputer as StartMenuXpPreference["showMyComputer"]) ?? "LINK",
      showMyDocs: (props.showMyDocs as StartMenuXpPreference["showMyDocs"]) ?? "LINK",
      showMyMusic: (props.showMyMusic as StartMenuXpPreference["showMyMusic"]) ?? "LINK",
      showMyPics: (props.showMyPics as StartMenuXpPreference["showMyPics"]) ?? "LINK",
      showNetConn: (props.showNetConn as StartMenuXpPreference["showNetConn"]) ?? "MENU",
      showRecentDocs: (props.showRecentDocs as StartMenuXpPreference["showRecentDocs"]) ?? "MENU",
      flags: parseFlags(XP_FLAG_NAMES, props),
    };
  }

  // StartMenuVista is a self-closing-friendly element too, but not nested inside StartMenu.
  const vistaMatch = /<StartMenuVista\b([^>]*)>([\s\S]*?)<\/StartMenuVista>/.exec(content);
  if (vistaMatch) {
    const attrs = extractAttrs(vistaMatch[1]);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(vistaMatch[2]);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    result.vista = {
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      minMFU: Number(props.minMFU ?? "6"),
      showControlPanel: (props.showControlPanel as StartMenuVistaPreference["showControlPanel"]) ?? "LINK",
      showMyComputer: (props.showMyComputer as StartMenuVistaPreference["showMyComputer"]) ?? "LINK",
      showMyDocs: (props.showMyDocs as StartMenuVistaPreference["showMyDocs"]) ?? "LINK",
      showMyMusic: (props.showMyMusic as StartMenuVistaPreference["showMyMusic"]) ?? "LINK",
      showMyPics: (props.showMyPics as StartMenuVistaPreference["showMyPics"]) ?? "LINK",
      showGames: (props.showGames as StartMenuVistaPreference["showGames"]) ?? "LINK",
      personalFolders: (props.personalFolders as StartMenuVistaPreference["personalFolders"]) ?? "LINK",
      showRecentDocs: (props.showRecentDocs as StartMenuVistaPreference["showRecentDocs"]) ?? "MENU",
      searchFiles: (props.searchFiles as StartMenuVistaPreference["searchFiles"]) ?? "INDEX",
      systemAdmin: (props.systemAdmin as StartMenuVistaPreference["systemAdmin"]) ?? "ALL",
      flags: parseFlags(VISTA_FLAG_NAMES, props),
    };
  }

  return result;
}

function buildStartMenuXml(data: StartMenuData): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  let body = "";

  if (data.xp) {
    const xp = data.xp;
    body +=
      `<StartMenu clsid="${STARTMENU_XP_CLSID}" name="Start Menu (Windows XP)" changed="${now}" uid="{${xp.uid}}">` +
      `<Properties minMFU="${xp.minMFU}" showControlPanel="${xp.showControlPanel}" startMenuFavorites="${xp.startMenuFavorites}" ` +
      `showMyComputer="${xp.showMyComputer}" showMyDocs="${xp.showMyDocs}" showMyMusic="${xp.showMyMusic}" ` +
      `showMyPics="${xp.showMyPics}" showNetConn="${xp.showNetConn}" showRecentDocs="${xp.showRecentDocs}" ` +
      `${buildFlagsAttrs(XP_FLAG_NAMES, xp.flags)}/>` +
      `</StartMenu>`;
  }

  if (data.vista) {
    const v = data.vista;
    body +=
      `<StartMenuVista clsid="${STARTMENU_VISTA_CLSID}" name="Start Menu (Windows Vista)" userContext="0" removePolicy="0" changed="${now}" uid="{${v.uid}}">` +
      `<Properties minMFU="${v.minMFU}" showMyComputer="${v.showMyComputer}" showControlPanel="${v.showControlPanel}" ` +
      `showMyDocs="${v.showMyDocs}" showGames="${v.showGames}" showMyMusic="${v.showMyMusic}" personalFolders="${v.personalFolders}" ` +
      `showMyPics="${v.showMyPics}" searchFiles="${v.searchFiles}" systemAdmin="${v.systemAdmin}" showRecentDocs="${v.showRecentDocs}" ` +
      `${buildFlagsAttrs(VISTA_FLAG_NAMES, v.flags)}/>` +
      `</StartMenuVista>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<StartMenuTaskbar clsid="${STARTMENUTASKBAR_CLSID}">${body}\r\n</StartMenuTaskbar>\r\n`;
}

export async function getStartMenuPreferences(domainDn: string, guid: string): Promise<StartMenuData> {
  try {
    const content = await fs.readFile(getStartMenuXmlPath(domainDn, guid), "utf-8");
    return parseStartMenuXml(content);
  } catch {
    return {};
  }
}

async function writeStartMenuPreferences(client: ldap.Client, domainDn: string, guid: string, data: StartMenuData): Promise<void> {
  const xmlPath = getStartMenuXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildStartMenuXml(data));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensureStartMenuCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function setStartMenuXpPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<StartMenuXpPreference, "uid">
): Promise<StartMenuXpPreference> {
  const current = await getStartMenuPreferences(domainDn, guid);
  const xp: StartMenuXpPreference = { ...data, uid: current.xp?.uid ?? crypto.randomUUID() };
  await writeStartMenuPreferences(client, domainDn, guid, { ...current, xp });
  return xp;
}

export async function setStartMenuVistaPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<StartMenuVistaPreference, "uid">
): Promise<StartMenuVistaPreference> {
  const current = await getStartMenuPreferences(domainDn, guid);
  const vista: StartMenuVistaPreference = { ...data, uid: current.vista?.uid ?? crypto.randomUUID() };
  await writeStartMenuPreferences(client, domainDn, guid, { ...current, vista });
  return vista;
}

async function removeStartMenuFile(client: ldap.Client, domainDn: string, guid: string): Promise<void> {
  await fs.rm(getStartMenuXmlPath(domainDn, guid), { force: true });
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await unregisterStartMenuCse(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function deleteStartMenuXpPreference(client: ldap.Client, domainDn: string, guid: string): Promise<void> {
  const current = await getStartMenuPreferences(domainDn, guid);
  if (!current.vista) {
    await removeStartMenuFile(client, domainDn, guid);
  } else {
    await writeStartMenuPreferences(client, domainDn, guid, { vista: current.vista });
  }
}

export async function deleteStartMenuVistaPreference(client: ldap.Client, domainDn: string, guid: string): Promise<void> {
  const current = await getStartMenuPreferences(domainDn, guid);
  if (!current.xp) {
    await removeStartMenuFile(client, domainDn, guid);
  } else {
    await writeStartMenuPreferences(client, domainDn, guid, { xp: current.xp });
  }
}
