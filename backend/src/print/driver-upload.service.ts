import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DriverArch, WindowsDriverPackage } from "@samba-admin/shared";
import { config } from "../config.js";
import { buildDriverDefinitionString, findMissingReferencedFiles, parseInf } from "./inf-parser.js";
import { runRpcClientCommand, type NetCredentials } from "./net-print-tool.js";

const DRIVERS_DIR = path.join(config.dataDir, "printer-drivers");
const DRIVERS_JSON = path.join(config.dataDir, "printer-drivers.json");
const ASSOCIATIONS_JSON = path.join(config.dataDir, "printer-driver-associations.json");

const SAMBA_DRIVER_ARCH_STRING: Record<DriverArch, string> = {
  x64: "Windows x64",
  W32X86: "Windows NT x86",
};

function readDriversList(): WindowsDriverPackage[] {
  if (!existsSync(DRIVERS_JSON)) return [];
  try {
    return JSON.parse(readFileSync(DRIVERS_JSON, "utf8")) as WindowsDriverPackage[];
  } catch {
    return [];
  }
}

function writeDriversList(list: WindowsDriverPackage[]): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(DRIVERS_JSON, JSON.stringify(list, null, 2));
}

function readAssociations(): Record<string, string> {
  if (!existsSync(ASSOCIATIONS_JSON)) return {};
  try {
    return JSON.parse(readFileSync(ASSOCIATIONS_JSON, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeAssociations(map: Record<string, string>): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(ASSOCIATIONS_JSON, JSON.stringify(map, null, 2));
}

export function getDriverIdForPrinter(printerName: string): string | undefined {
  return readAssociations()[printerName];
}

export function listDriverPackages(): WindowsDriverPackage[] {
  return readDriversList();
}

export interface UploadedFile {
  originalname: string;
  path: string;
}

// The uploaded display name and filenames end up embedded in a quoted
// `rpcclient -c "..."` command string (see associateDriverWithPrinter) —
// rejecting quotes/semicolons/control characters here closes that off as an
// injection vector, and path.basename() (applied below) keeps filenames
// from escaping the destination directory via "../".
const UNSAFE_CHARS_RE = /["`;$\r\n]/;

function assertSafeName(name: string, field: string): void {
  if (UNSAFE_CHARS_RE.test(name)) {
    throw new Error(`${field} "${name}" enthält nicht erlaubte Zeichen (Anführungszeichen, Semikolon o.ä.).`);
  }
}

/** Parses the uploaded INF, validates every file it references was actually included, and stores the package under `dataDir` (not `[print$]` yet — that only happens on association, see `associateDriverWithPrinter`). */
export async function uploadDriverPackage(files: UploadedFile[], arch: DriverArch, displayNameOverride?: string): Promise<WindowsDriverPackage> {
  const sanitizedFiles = files.map((f) => ({ ...f, originalname: path.basename(f.originalname) }));
  for (const f of sanitizedFiles) assertSafeName(f.originalname, "Dateiname");
  if (displayNameOverride) assertSafeName(displayNameOverride, "Anzeigename");

  const infFile = sanitizedFiles.find((f) => f.originalname.toLowerCase().endsWith(".inf"));
  if (!infFile) throw new Error("Es wurde keine .inf-Datei im Upload gefunden.");

  const infContent = await fs.readFile(infFile.path, "utf8");
  const models = parseInf(infContent);
  const uploadedNames = sanitizedFiles.map((f) => f.originalname);
  const matchingModel = models.find((m) => m.arch === arch) ?? models[0];
  if (!matchingModel) throw new Error("Die INF-Datei enthält kein erkennbares Treibermodell für diese Architektur.");
  assertSafeName(matchingModel.displayName, "Anzeigename");

  const missing = findMissingReferencedFiles(matchingModel, uploadedNames);
  if (missing.length > 0) {
    throw new Error(`Von der INF referenzierte Datei(en) fehlen im Upload: ${missing.join(", ")}`);
  }

  const driverId = randomUUID();
  const destDir = path.join(DRIVERS_DIR, driverId);
  mkdirSync(destDir, { recursive: true });
  for (const file of sanitizedFiles) {
    await fs.copyFile(file.path, path.join(destDir, file.originalname));
  }

  const pkg: WindowsDriverPackage = {
    driverId,
    displayName: displayNameOverride || matchingModel.displayName,
    arch,
    infFileName: infFile.originalname,
    files: uploadedNames,
    uploadedAt: new Date().toISOString(),
    installedInSamba: false,
  };
  const list = readDriversList();
  list.push(pkg);
  writeDriversList(list);
  return pkg;
}

export async function deleteDriverPackage(driverId: string): Promise<void> {
  writeDriversList(readDriversList().filter((p) => p.driverId !== driverId));
  const destDir = path.join(DRIVERS_DIR, driverId);
  if (existsSync(destDir)) await fs.rm(destDir, { recursive: true, force: true });
}

/**
 * Copies the driver's files into the live `[print$]` store and registers it
 * via `rpcclient`'s `adddriver`/`setdriver` (idempotent — only re-runs
 * `adddriver` if this package hasn't already been installed). Deleting an
 * uploaded package (`deleteDriverPackage`) does NOT undo this — the two are
 * deliberately separate actions so removing an upload never surprises an
 * admin by breaking a printer that's actively using it.
 */
export async function associateDriverWithPrinter(driverId: string, printerName: string, creds: NetCredentials): Promise<void> {
  const list = readDriversList();
  const pkg = list.find((p) => p.driverId === driverId);
  if (!pkg) throw new Error("Treiberpaket nicht gefunden.");

  const srcDir = path.join(DRIVERS_DIR, driverId);
  const destDir = path.join("/var/lib/samba/printers", pkg.arch);
  mkdirSync(destDir, { recursive: true });
  for (const fileName of pkg.files) {
    const dest = path.join(destDir, fileName);
    if (!existsSync(dest)) {
      await fs.copyFile(path.join(srcDir, fileName), dest);
    }
  }

  if (!pkg.installedInSamba) {
    const infContent = await fs.readFile(path.join(srcDir, pkg.infFileName), "utf8");
    const models = parseInf(infContent);
    const model = models.find((m) => m.arch === pkg.arch) ?? models[0];
    if (!model) throw new Error("Treibermodell konnte nicht erneut aus der INF gelesen werden.");
    const definition = buildDriverDefinitionString(pkg.displayName, model, pkg.files);
    const archString = SAMBA_DRIVER_ARCH_STRING[pkg.arch];
    await runRpcClientCommand(creds, `adddriver "${archString}" "${definition}"`);
    pkg.installedInSamba = true;
    writeDriversList(list);
  }

  await runRpcClientCommand(creds, `setdriver ${printerName} "${pkg.displayName}"`);

  const associations = readAssociations();
  associations[printerName] = driverId;
  writeAssociations(associations);
}

export function removeDriverFromPrinter(printerName: string): void {
  const associations = readAssociations();
  delete associations[printerName];
  writeAssociations(associations);
}
