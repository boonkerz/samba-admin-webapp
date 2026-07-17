import path from "path";
import { runCapture } from "../exec/safeExec.js";
import { config } from "../config.js";

const GPO_SECURITY_SCRIPT = path.resolve(config.scriptsDir, "gpo-security.py");

/** The "Apply Group Policy" extended right's control-access-right GUID — the same GUID on every GPO/AD forest, not domain-specific. */
export const APPLY_GROUP_POLICY_RIGHT_GUID = "edacfd8f-ffb3-11d1-b41d-00a0c968f939";

export interface SddlAce {
  type: string;
  flags: string;
  rights: string;
  objectGuid?: string;
  inheritObjectGuid?: string;
  trustee: string;
}

export interface ParsedSddl {
  owner?: string;
  group?: string;
  daclFlags: string;
  dacl: SddlAce[];
  saclFlags: string;
  sacl: SddlAce[];
}

function extractSection(sddl: string, marker: "O" | "G" | "D" | "S"): string | undefined {
  const key = `${marker}:`;
  const idx = sddl.indexOf(key);
  if (idx === -1) return undefined;
  const start = idx + key.length;
  let end = sddl.length;
  for (const m of ["O:", "G:", "D:", "S:"]) {
    if (m === key) continue;
    const mi = sddl.indexOf(m, start);
    if (mi !== -1 && mi < end) end = mi;
  }
  return sddl.slice(start, end);
}

function parseAclSection(section: string | undefined): { flags: string; aces: SddlAce[] } {
  if (!section) return { flags: "", aces: [] };
  const firstParen = section.indexOf("(");
  const flags = firstParen === -1 ? section : section.slice(0, firstParen);
  const aces: SddlAce[] = [];
  const aceRe = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = aceRe.exec(section)) !== null) {
    const parts = m[1].split(";");
    aces.push({
      type: parts[0] ?? "",
      flags: parts[1] ?? "",
      rights: parts[2] ?? "",
      objectGuid: parts[3] || undefined,
      inheritObjectGuid: parts[4] || undefined,
      trustee: parts[5] ?? "",
    });
  }
  return { flags, aces };
}

export function parseSddl(sddl: string): ParsedSddl {
  const dacl = parseAclSection(extractSection(sddl, "D"));
  const sacl = parseAclSection(extractSection(sddl, "S"));
  return {
    owner: extractSection(sddl, "O"),
    group: extractSection(sddl, "G"),
    daclFlags: dacl.flags,
    dacl: dacl.aces,
    saclFlags: sacl.flags,
    sacl: sacl.aces,
  };
}

function serializeAce(ace: SddlAce): string {
  return `(${ace.type};${ace.flags};${ace.rights};${ace.objectGuid ?? ""};${ace.inheritObjectGuid ?? ""};${ace.trustee})`;
}

export function serializeSddl(parsed: ParsedSddl): string {
  let out = "";
  if (parsed.owner) out += `O:${parsed.owner}`;
  if (parsed.group) out += `G:${parsed.group}`;
  out += `D:${parsed.daclFlags}${parsed.dacl.map(serializeAce).join("")}`;
  if (parsed.sacl.length > 0 || parsed.saclFlags) out += `S:${parsed.saclFlags}${parsed.sacl.map(serializeAce).join("")}`;
  return out;
}

/** Splits a concatenated SDDL rights string ("LCRPLORC") into its 2-letter codes, order-independent. */
export function rightsSet(rights: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < rights.length; i += 2) set.add(rights.slice(i, i + 2));
  return set;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export const READ_RIGHTS = new Set(["LC", "RP", "LO", "RC"]);
export const EDIT_RIGHTS = new Set([...READ_RIGHTS, "WP"]);
export const FULL_CONTROL_RIGHTS = new Set(["CC", "DC", "LC", "SW", "RP", "WP", "DT", "LO", "SD", "RC", "WD", "WO"]);

export function isReadRights(rights: string): boolean {
  return setEquals(rightsSet(rights), READ_RIGHTS);
}

export function isEditRights(rights: string): boolean {
  return setEquals(rightsSet(rights), EDIT_RIGHTS);
}

export function isFullControlRights(rights: string): boolean {
  return setEquals(rightsSet(rights), FULL_CONTROL_RIGHTS);
}

export function gpoDnOf(domainDn: string, guid: string): string {
  return `CN={${guid}},CN=Policies,CN=System,${domainDn}`;
}

export async function getGpoSddl(gpoDn: string): Promise<string> {
  const result = await runCapture("python3", [GPO_SECURITY_SCRIPT, "get", gpoDn]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read GPO security descriptor: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export async function setGpoSddl(gpoDn: string, sddl: string): Promise<void> {
  const result = await runCapture("python3", [GPO_SECURITY_SCRIPT, "set", gpoDn], { input: sddl });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to write GPO security descriptor: ${result.stderr || result.stdout}`);
  }
}
