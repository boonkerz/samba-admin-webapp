import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { FolderOptionsPreference } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Folder Options CLSIDs, from the official [MS-GPPREF] FolderOptions
// XML example — four distinct real-GPME-creatable item kinds.
const FOLDEROPTIONS_CLSID = "{8AB5F5D7-F676-48ab-A94E-1186E120EFDC}";
const GLOBAL_XP_CLSID = "{E7632293-E3FC-4fee-9CD3-584C95D8D2A0}";
const GLOBAL_VISTA_CLSID = "{DBF1E3CD-4CA2-407c-BE84-5F67D3BE754D}";
const OPEN_WITH_CLSID = "{100B9C09-906A-4f5a-9C41-1BD98B6CA022}";
const FILE_TYPE_CLSID = "{580C4D3B-7A89-44d0-92D2-C105702C7BD0}";

const FOLDEROPTIONS_CSE_GUID = "{A3F3E39B-5D83-4940-B954-28315B82F0A8}";
const FOLDEROPTIONS_TOOL_GUID = "{3BFAE46A-7F3A-467B-8CEA-6AA34DC71F53}";

function getFolderOptionsXmlPath(domainDn: string, guid: string): string {
  return path.join(getSysvolPath(domainDn), `{${guid}}`, "User", "Preferences", "FolderOptions", "FolderOptions.xml");
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

async function ensureFolderOptionsCseRegistered(client: ldap.Client, gpoDn: string): Promise<void> {
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["gPCUserExtensionNames"] });
  const current = attrString(entries[0]?.attributes ?? {}, "gPCUserExtensionNames") ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === FOLDEROPTIONS_CSE_GUID.toUpperCase())) return;

  groups.push([FOLDEROPTIONS_CSE_GUID, FOLDEROPTIONS_TOOL_GUID]);
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

function parseFolderOptionsXml(content: string): FolderOptionsPreference[] {
  const items: FolderOptionsPreference[] = [];
  let order = 0;

  const elementRe = /<(GlobalFolderOptions|GlobalFolderOptionsVista|OpenWith|FileType)\b([^>]*?)(?<!\/)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*)\/?>/.exec(inner);
    const props = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const uid = (attrs.uid ?? "").replace(/[{}]/g, "");
    const action = (props.action as FolderOptionsPreference["action"]) ?? "U";

    if (tag === "GlobalFolderOptions") {
      items.push({
        uid,
        order: order++,
        action,
        kind: "globalXp",
        noNetCrawling: bool(props.noNetCrawling),
        folderContentsInfoTip: bool(props.folderContentsInfoTip),
        friendlyTree: bool(props.friendlyTree),
        fullPathAddress: bool(props.fullPathAddress),
        fullPath: bool(props.fullPath),
        disableThumbnailCache: bool(props.disableThumbnailCache),
        hidden: (props.hidden as "HIDE" | "SHOWALL") ?? "SHOWALL",
        hideFileExt: bool(props.hideFileExt),
        separateProcess: bool(props.separateProcess),
        showSuperHidden: bool(props.showSuperHidden),
        classicViewState: bool(props.classicViewState),
        persistBrowsers: bool(props.persistBrowsers),
        showControlPanel: bool(props.showControlPanel),
        showCompColor: bool(props.showCompColor),
        showInfoTip: bool(props.showInfoTip),
        webViewBarricade: bool(props.webViewBarricade),
        forceGuest: bool(props.forceGuest),
      });
    } else if (tag === "GlobalFolderOptionsVista") {
      items.push({
        uid,
        order: order++,
        action,
        kind: "globalVista",
        alwaysShowIcons: bool(props.alwaysShowIcons),
        alwaysShowMenus: bool(props.alwaysShowMenus),
        displayIconThumb: bool(props.displayIconThumb),
        displayFileSize: bool(props.displayFileSize),
        displaySimpleFolders: bool(props.displaySimpleFolders),
        fullPath: bool(props.fullPath),
        hidden: (props.hidden as "HIDE" | "SHOWALL") ?? "SHOWALL",
        hideFileExt: bool(props.hideFileExt),
        showSuperHidden: bool(props.showSuperHidden),
        separateProcess: bool(props.separateProcess),
        classicViewState: bool(props.classicViewState),
        persistBrowsers: bool(props.persistBrowsers),
        showDriveLetter: bool(props.showDriveLetter),
        showCompColor: bool(props.showCompColor),
        showInfoTip: bool(props.showInfoTip),
        showPreviewHandlers: bool(props.showPreviewHandlers),
        useCheckBoxes: bool(props.useCheckBoxes),
        useSharingWizard: bool(props.useSharingWizard),
        listViewTyping: (props.listViewTyping as "SELECT" | "TYPE") ?? "SELECT",
      });
    } else if (tag === "OpenWith") {
      items.push({
        uid,
        order: order++,
        action,
        kind: "openWith",
        fileExtension: props.fileExtension ?? "",
        applicationPath: props.applicationPath ?? "",
        default: bool(props.default),
      });
    } else {
      items.push({
        uid,
        order: order++,
        action,
        kind: "fileType",
        fileExt: props.fileExt ?? "",
        application: props.application ?? "",
        appProgID: props.appProgID ?? "",
        configActions: bool(props.configActions),
      });
    }
  }

  return items;
}

function buildFolderOptionsXml(items: FolderOptionsPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const body = items
    .map((item) => {
      if (item.kind === "globalXp") {
        return (
          `<GlobalFolderOptions clsid="${GLOBAL_XP_CLSID}" name="Folder Options (Windows XP)" changed="${now}" uid="{${item.uid}}">` +
          `<Properties noNetCrawling="${boolAttr(item.noNetCrawling)}" folderContentsInfoTip="${boolAttr(item.folderContentsInfoTip)}" ` +
          `friendlyTree="${boolAttr(item.friendlyTree)}" fullPathAddress="${boolAttr(item.fullPathAddress)}" fullPath="${boolAttr(item.fullPath)}" ` +
          `disableThumbnailCache="${boolAttr(item.disableThumbnailCache)}" hidden="${item.hidden}" hideFileExt="${boolAttr(item.hideFileExt)}" ` +
          `separateProcess="${boolAttr(item.separateProcess)}" showSuperHidden="${boolAttr(item.showSuperHidden)}" ` +
          `classicViewState="${boolAttr(item.classicViewState)}" persistBrowsers="${boolAttr(item.persistBrowsers)}" ` +
          `showControlPanel="${boolAttr(item.showControlPanel)}" showCompColor="${boolAttr(item.showCompColor)}" ` +
          `showInfoTip="${boolAttr(item.showInfoTip)}" webViewBarricade="${boolAttr(item.webViewBarricade)}" forceGuest="${boolAttr(item.forceGuest)}"/>` +
          `</GlobalFolderOptions>`
        );
      }
      if (item.kind === "globalVista") {
        return (
          `<GlobalFolderOptionsVista clsid="${GLOBAL_VISTA_CLSID}" name="Folder Options (Windows Vista)" image="2" changed="${now}" uid="{${item.uid}}">` +
          `<Properties alwaysShowIcons="${boolAttr(item.alwaysShowIcons)}" alwaysShowMenus="${boolAttr(item.alwaysShowMenus)}" ` +
          `displayIconThumb="${boolAttr(item.displayIconThumb)}" displayFileSize="${boolAttr(item.displayFileSize)}" ` +
          `displaySimpleFolders="${boolAttr(item.displaySimpleFolders)}" fullPath="${boolAttr(item.fullPath)}" hidden="${item.hidden}" ` +
          `hideFileExt="${boolAttr(item.hideFileExt)}" showSuperHidden="${boolAttr(item.showSuperHidden)}" separateProcess="${boolAttr(item.separateProcess)}" ` +
          `classicViewState="${boolAttr(item.classicViewState)}" persistBrowsers="${boolAttr(item.persistBrowsers)}" ` +
          `showDriveLetter="${boolAttr(item.showDriveLetter)}" showCompColor="${boolAttr(item.showCompColor)}" showInfoTip="${boolAttr(item.showInfoTip)}" ` +
          `showPreviewHandlers="${boolAttr(item.showPreviewHandlers)}" useCheckBoxes="${boolAttr(item.useCheckBoxes)}" ` +
          `useSharingWizard="${boolAttr(item.useSharingWizard)}" listViewTyping="${item.listViewTyping}"/>` +
          `</GlobalFolderOptionsVista>`
        );
      }
      if (item.kind === "openWith") {
        const escapedExt = escapeXml(item.fileExtension);
        return (
          `<OpenWith clsid="${OPEN_WITH_CLSID}" name="${escapedExt}" image="2" changed="${now}" uid="{${item.uid}}">` +
          `<Properties action="${item.action}" fileExtension="${escapedExt}" applicationPath="${escapeXml(item.applicationPath)}" ` +
          `default="${boolAttr(item.default)}"/>` +
          `</OpenWith>`
        );
      }
      const escapedExt = escapeXml(item.fileExt);
      return (
        `<FileType clsid="${FILE_TYPE_CLSID}" name="${escapedExt}" image="2" changed="${now}" uid="{${item.uid}}">` +
        `<Properties action="${item.action}" fileExt="${escapedExt}" application="${escapeXml(item.application)}" ` +
        `appProgID="${escapeXml(item.appProgID)}" configActions="${boolAttr(item.configActions)}"/>` +
        `</FileType>`
      );
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>\r\n<FolderOptions clsid="${FOLDEROPTIONS_CLSID}">${body}\r\n</FolderOptions>\r\n`;
}

export async function listFolderOptionsPreferences(domainDn: string, guid: string): Promise<FolderOptionsPreference[]> {
  try {
    const content = await fs.readFile(getFolderOptionsXmlPath(domainDn, guid), "utf-8");
    return parseFolderOptionsXml(content);
  } catch {
    return [];
  }
}

async function writeFolderOptionsPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  items: FolderOptionsPreference[]
): Promise<void> {
  const xmlPath = getFolderOptionsXmlPath(domainDn, guid);
  const dir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(dir).then(
    () => false,
    () => true
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(xmlPath, buildFolderOptionsXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, "user");
  await ensureFolderOptionsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

export async function createFolderOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  data: Omit<FolderOptionsPreference, "uid" | "order">
): Promise<FolderOptionsPreference> {
  const items = await listFolderOptionsPreferences(domainDn, guid);
  const newItem = { ...data, uid: crypto.randomUUID(), order: items.length } as FolderOptionsPreference;
  await writeFolderOptionsPreferences(client, domainDn, guid, [...items, newItem]);
  return newItem;
}

export async function updateFolderOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string,
  data: Omit<FolderOptionsPreference, "uid" | "order">
): Promise<FolderOptionsPreference> {
  const items = await listFolderOptionsPreferences(domainDn, guid);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Ordneroption nicht gefunden.");
  const updated = { ...data, uid, order: items[idx].order } as FolderOptionsPreference;
  items[idx] = updated;
  await writeFolderOptionsPreferences(client, domainDn, guid, items);
  return updated;
}

export async function deleteFolderOptionsPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  uid: string
): Promise<void> {
  const items = await listFolderOptionsPreferences(domainDn, guid);
  await writeFolderOptionsPreferences(client, domainDn, guid, items.filter((i) => i.uid !== uid));
}
