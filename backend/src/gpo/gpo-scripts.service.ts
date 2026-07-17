import fs from "fs/promises";
import path from "path";
import type ldap from "ldapjs";
import type { CreateGpoScriptRequest, GpoScript, ScriptEvent, ScriptKind, UpdateGpoScriptRequest } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// The classic (non-GPP) Scripts client-side extension, per [MS-GPSCR] — same
// authoritative-source convention as the GPP extension GUID pairs (see
// gpp-registry.service.ts). Distinct from the GPP preference extensions:
// this is what real GPME calls "Scripts (Startup/Shutdown)" / "Scripts
// (Logon/Logoff)" under Policies > Windows Settings, not a Preferences item.
const SCRIPTS_CSE_GUID = "{42B5FAAE-6536-11D2-AE5A-0000F87571E3}";
const SCRIPTS_TOOL_GUID = "{40B6664F-4972-11D1-A7CA-0000F87571E3}";

type Scope = "machine" | "user";

const EVENTS_BY_SCOPE: Record<Scope, ScriptEvent[]> = {
  machine: ["startup", "shutdown"],
  user: ["logon", "logoff"],
};

const SECTION_NAME: Record<ScriptEvent, string> = {
  startup: "Startup",
  shutdown: "Shutdown",
  logon: "Logon",
  logoff: "Logoff",
};

const KIND_INI_FILE: Record<ScriptKind, string> = {
  script: "scripts.ini",
  powershell: "psscripts.ini",
};

function getScriptsDir(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Scripts");
}

function getIniPath(domainDn: string, guid: string, scope: Scope, kind: ScriptKind): string {
  return path.join(getScriptsDir(domainDn, guid, scope), KIND_INI_FILE[kind]);
}

function getEventDir(domainDn: string, guid: string, scope: Scope, event: ScriptEvent): string {
  return path.join(getScriptsDir(domainDn, guid, scope), SECTION_NAME[event]);
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

/** Same mechanism as gpp-registry.service.ts's ensureRegistryCseRegistered — writing the ini/script files alone does nothing on a real client without this. */
async function ensureScriptsCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === SCRIPTS_CSE_GUID.toUpperCase())) return;

  groups.push([SCRIPTS_CSE_GUID, SCRIPTS_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", attrName, serializeExtensionGroups(groups))]);
}

interface IniEntry {
  index: number;
  cmdLine: string;
  parameters: string;
}

function parseScriptsIni(content: string): Record<string, IniEntry[]> {
  const bySection: Record<string, Record<number, Partial<IniEntry>>> = {};
  let currentSection = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      bySection[currentSection] ??= {};
      continue;
    }
    if (!currentSection) continue;
    const kvMatch = line.match(/^(\d+)(CmdLine|Parameters)=(.*)$/);
    if (!kvMatch) continue;
    const idx = Number(kvMatch[1]);
    bySection[currentSection] ??= {};
    bySection[currentSection][idx] ??= {};
    if (kvMatch[2] === "CmdLine") bySection[currentSection][idx].cmdLine = kvMatch[3];
    else bySection[currentSection][idx].parameters = kvMatch[3];
  }

  const result: Record<string, IniEntry[]> = {};
  for (const [section, byIdx] of Object.entries(bySection)) {
    result[section] = Object.entries(byIdx)
      .map(([idx, e]) => ({ index: Number(idx), cmdLine: e.cmdLine ?? "", parameters: e.parameters ?? "" }))
      .sort((a, b) => a.index - b.index);
  }
  return result;
}

function buildScriptsIni(sections: Record<string, IniEntry[]>, eventOrder: ScriptEvent[]): string {
  return eventOrder
    .map((event) => {
      const sectionName = SECTION_NAME[event];
      const entries = sections[sectionName] ?? [];
      const lines = entries.map((e, i) => `${i}CmdLine=${e.cmdLine}\r\n${i}Parameters=${e.parameters}`).join("\r\n");
      return `[${sectionName}]\r\n${lines}${lines ? "\r\n" : ""}`;
    })
    .join("");
}

/** Rejects newlines so a fileName/parameters value can't inject extra ini lines or sections. */
function assertSingleLine(value: string, field: string): void {
  if (/[\r\n]/.test(value)) throw new Error(`${field} darf keine Zeilenumbrüche enthalten.`);
}

/** Reduces to a bare filename so it can never escape the intended event directory via "../". */
function sanitizeFileName(fileName: string): string {
  assertSingleLine(fileName, "Dateiname");
  const base = path.basename(fileName.trim());
  if (!base || base === "." || base === "..") throw new Error("Ungültiger Dateiname.");
  return base;
}

export async function listGpoScripts(domainDn: string, guid: string, scope: Scope): Promise<GpoScript[]> {
  const result: GpoScript[] = [];
  for (const kind of Object.keys(KIND_INI_FILE) as ScriptKind[]) {
    let content = "";
    try {
      content = await fs.readFile(getIniPath(domainDn, guid, scope, kind), "utf-8");
    } catch {
      continue;
    }
    const sections = parseScriptsIni(content);
    for (const event of EVENTS_BY_SCOPE[scope]) {
      const entries = sections[SECTION_NAME[event]] ?? [];
      for (const entry of entries) {
        if (!entry.cmdLine) continue;
        let scriptContent = "";
        try {
          scriptContent = await fs.readFile(path.join(getEventDir(domainDn, guid, scope, event), entry.cmdLine), "utf-8");
        } catch {}
        result.push({
          uid: `${event}:${kind}:${entry.index}`,
          order: entry.index,
          event,
          kind,
          fileName: entry.cmdLine,
          parameters: entry.parameters,
          content: scriptContent,
        });
      }
    }
  }
  return result;
}

async function writeGpoScripts(client: ldap.Client, domainDn: string, guid: string, scope: Scope, items: GpoScript[]): Promise<void> {
  const scriptsDir = getScriptsDir(domainDn, guid, scope);
  const isNewDir = await fs.stat(scriptsDir).then(
    () => false,
    () => true
  );
  await fs.mkdir(scriptsDir, { recursive: true });

  for (const kind of Object.keys(KIND_INI_FILE) as ScriptKind[]) {
    const sections: Record<string, IniEntry[]> = {};
    for (const event of EVENTS_BY_SCOPE[scope]) {
      const entries = items.filter((i) => i.event === event && i.kind === kind);
      sections[SECTION_NAME[event]] = entries.map((e, idx) => ({ index: idx, cmdLine: e.fileName, parameters: e.parameters }));
    }
    await fs.writeFile(getIniPath(domainDn, guid, scope, kind), buildScriptsIni(sections, EVENTS_BY_SCOPE[scope]));
  }

  for (const event of EVENTS_BY_SCOPE[scope]) {
    const eventDir = getEventDir(domainDn, guid, scope, event);
    await fs.rm(eventDir, { recursive: true, force: true });
    const entries = items.filter((i) => i.event === event);
    if (entries.length > 0) {
      await fs.mkdir(eventDir, { recursive: true });
      for (const e of entries) {
        await fs.writeFile(path.join(eventDir, e.fileName), e.content);
      }
    }
  }

  if (isNewDir) await fixNewSysvolDirAcl();
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureScriptsCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

export async function createGpoScript(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: CreateGpoScriptRequest
): Promise<GpoScript> {
  if (!EVENTS_BY_SCOPE[scope].includes(data.event)) {
    throw new Error(`Ereignis "${data.event}" ist für diesen Bereich nicht gültig.`);
  }
  const fileName = sanitizeFileName(data.fileName);
  assertSingleLine(data.parameters, "Parameter");

  const items = await listGpoScripts(domainDn, guid, scope);
  const groupCount = items.filter((i) => i.event === data.event && i.kind === data.kind).length;
  const newItem: GpoScript = { ...data, fileName, uid: `${data.event}:${data.kind}:${groupCount}`, order: groupCount };
  await writeGpoScripts(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateGpoScript(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: UpdateGpoScriptRequest
): Promise<GpoScript> {
  const fileName = sanitizeFileName(data.fileName);
  assertSingleLine(data.parameters, "Parameter");

  const items = await listGpoScripts(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Skript nicht gefunden.");
  const updated: GpoScript = { ...items[idx], ...data, fileName };
  items[idx] = updated;
  await writeGpoScripts(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteGpoScript(client: ldap.Client, domainDn: string, guid: string, scope: Scope, uid: string): Promise<void> {
  const items = await listGpoScripts(domainDn, guid, scope);
  await writeGpoScripts(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
