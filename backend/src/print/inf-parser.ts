import type { DriverArch } from "@samba-admin/shared";

/**
 * Hand-rolled, best-effort Windows INF parser — real driver INFs support a
 * much larger spec (nested [Include]/[Needs] directives, %sect% decoration
 * beyond arch, layout.inf indirection) that this deliberately does not
 * implement. This covers the common case: [Manufacturer] -> arch-suffixed
 * model-list section -> per-model install section -> DriverFile/DataFile/
 * ConfigFile/HelpFile/CopyFiles. Good enough to get a real driver into the
 * samba `[print$]` store; anything more exotic should be diagnosed from the
 * "missing referenced file" error this produces rather than silently
 * mis-parsed.
 */

const ARCH_MAP: Record<string, DriverArch> = {
  NTamd64: "x64",
  amd64: "x64",
  NTx86: "W32X86",
  x86: "W32X86",
};

export interface ParsedInfModel {
  displayName: string;
  arch: DriverArch;
  driverFile: string;
  dataFile?: string;
  configFile?: string;
  helpFile?: string;
  otherFiles: string[];
}

function stripComment(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ";" && !inQuotes) return line.slice(0, i);
  }
  return line;
}

function parseSections(content: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      current = sectionMatch[1].trim();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  return sections;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^"(.*)"$/, "$1");
}

function parseStrings(sections: Map<string, string[]>): Map<string, string> {
  const strings = new Map<string, string>();
  for (const line of sections.get("Strings") ?? []) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    strings.set(unquote(line.slice(0, eq)), unquote(line.slice(eq + 1)));
  }
  return strings;
}

function resolveToken(value: string, strings: Map<string, string>): string {
  const trimmed = value.trim();
  const tokenMatch = trimmed.match(/^%(.+)%$/);
  if (!tokenMatch) return unquote(trimmed);
  return strings.get(tokenMatch[1]) ?? trimmed;
}

interface ManufacturerEntry {
  modelSection: string;
  archTokens: string[];
}

function parseManufacturer(sections: Map<string, string[]>): ManufacturerEntry[] {
  const entries: ManufacturerEntry[] = [];
  for (const line of sections.get("Manufacturer") ?? []) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const parts = line
      .slice(eq + 1)
      .split(",")
      .map((s) => s.trim());
    const modelSection = parts[0];
    if (!modelSection) continue;
    const archTokens = parts.slice(1).filter(Boolean);
    entries.push({ modelSection, archTokens: archTokens.length > 0 ? archTokens : [""] });
  }
  return entries;
}

interface ModelListEntry {
  displayName: string;
  installSection: string;
  arch: DriverArch;
}

function resolveModelSectionName(sections: Map<string, string[]>, modelSection: string, archToken: string): string {
  const suffixed = `${modelSection}.${archToken}`;
  return sections.has(suffixed) ? suffixed : modelSection;
}

function parseModelEntries(sections: Map<string, string[]>, strings: Map<string, string>): ModelListEntry[] {
  const models: ModelListEntry[] = [];
  for (const mfr of parseManufacturer(sections)) {
    for (const archToken of mfr.archTokens) {
      const arch = ARCH_MAP[archToken];
      if (!arch) continue; // unsupported/unlisted arch (arm64, ia64, ...) — skip
      const sectionName = resolveModelSectionName(sections, mfr.modelSection, archToken);
      for (const line of sections.get(sectionName) ?? []) {
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const rest = line
          .slice(eq + 1)
          .split(",")
          .map((s) => s.trim());
        const installSection = rest[0];
        if (!installSection) continue;
        models.push({ displayName: resolveToken(line.slice(0, eq), strings), installSection, arch });
      }
    }
  }
  return models;
}

interface InstallSectionFiles {
  driverFile?: string;
  dataFile?: string;
  configFile?: string;
  helpFile?: string;
  otherFiles: string[];
}

function parseInstallSection(sections: Map<string, string[]>, sectionName: string, seen = new Set<string>()): InstallSectionFiles {
  const result: InstallSectionFiles = { otherFiles: [] };
  if (seen.has(sectionName)) return result; // guard against DataSection cycles
  seen.add(sectionName);

  const copyFilesRefs: string[] = [];
  for (const line of sections.get(sectionName) ?? []) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === "driverfile") result.driverFile = unquote(value);
    else if (key === "datafile") result.dataFile = unquote(value);
    else if (key === "configfile") result.configFile = unquote(value);
    else if (key === "helpfile") result.helpFile = unquote(value);
    else if (key === "datasection") {
      const redirected = parseInstallSection(sections, unquote(value), seen);
      Object.assign(result, { ...redirected, otherFiles: [...result.otherFiles, ...redirected.otherFiles] });
    } else if (key === "copyfiles") {
      copyFilesRefs.push(...value.split(",").map((s) => unquote(s.trim())).filter(Boolean));
    }
  }

  const files: string[] = [];
  for (const ref of copyFilesRefs) {
    if (sections.has(ref)) {
      // CopyFiles referencing another section name: that section's lines are themselves filenames.
      files.push(...(sections.get(ref) ?? []).map((l) => unquote(l.split(",")[0].trim())).filter(Boolean));
    } else {
      files.push(ref);
    }
  }
  result.otherFiles = [...result.otherFiles, ...files];
  return result;
}

export function parseInf(content: string): ParsedInfModel[] {
  const sections = parseSections(content);
  const strings = parseStrings(sections);
  const results: ParsedInfModel[] = [];
  for (const model of parseModelEntries(sections, strings)) {
    const files = parseInstallSection(sections, model.installSection);
    if (!files.driverFile) continue;
    results.push({
      displayName: model.displayName,
      arch: model.arch,
      driverFile: files.driverFile,
      dataFile: files.dataFile,
      configFile: files.configFile,
      helpFile: files.helpFile,
      otherFiles: files.otherFiles,
    });
  }
  return results;
}

/** Every file the model references must actually be among the uploaded files — returns the missing ones (empty = OK). */
export function findMissingReferencedFiles(model: ParsedInfModel, uploadedFileNames: string[]): string[] {
  const uploaded = new Set(uploadedFileNames.map((f) => f.toLowerCase()));
  const required = [model.driverFile, model.dataFile, model.configFile, model.helpFile, ...model.otherFiles].filter(
    (f): f is string => !!f
  );
  return [...new Set(required)].filter((f) => !uploaded.has(f.toLowerCase()));
}

/**
 * Builds the colon-separated driver-definition string `rpcclient`'s
 * `adddriver` command expects (per its man page):
 *   LongName:DriverFile:DataFile:ConfigFile:HelpFile:LanguageMonitor:DefaultDataType:CommaSeparatedFiles
 * Empty fields must literally be the string "NULL", not blank — confirmed
 * against the real rpcclient man page and verified live.
 */
export function buildDriverDefinitionString(longName: string, model: ParsedInfModel, uploadedFileNames: string[]): string {
  const namedFiles = new Set(
    [model.driverFile, model.dataFile, model.configFile, model.helpFile].filter((f): f is string => !!f).map((f) => f.toLowerCase())
  );
  const otherFiles = uploadedFileNames.filter((f) => !namedFiles.has(f.toLowerCase()) && !f.toLowerCase().endsWith(".inf"));
  return [
    longName,
    model.driverFile,
    model.dataFile ?? "NULL",
    model.configFile ?? "NULL",
    model.helpFile ?? "NULL",
    "NULL",
    "RAW",
    otherFiles.length > 0 ? otherFiles.join(",") : "NULL",
  ].join(":");
}
