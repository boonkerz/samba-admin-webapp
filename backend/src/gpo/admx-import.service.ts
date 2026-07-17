import fs from "node:fs/promises";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture } from "../exec/safeExec.js";
import { config } from "../config.js";
import { getPolicyDefinitionsPath, clearAdmxCache } from "./admx.service.js";

const BUILD_ADMX_CACHE_SCRIPT = path.resolve(config.scriptsDir, "build-admx-cache.py");

export interface AdmxImportResult {
  admxFilesAdded: string[];
  admlFilesAdded: string[];
}

/**
 * Real ADMX bundles (Chrome, Adobe, ...) ship their .adml translations under
 * a folder already named for the locale, but naming conventions vary between
 * vendors ("de", "de-DE", "de_DE"). Windows' own Central Store only ever
 * looks for BCP-47-style hyphenated folder names ("de-DE"), so anything else
 * needs normalizing or the strings silently fail to resolve client-side.
 */
const LANG_FOLDER_MAP: Record<string, string> = {
  "en": "en-US",
  "en-us": "en-US",
  "en_us": "en-US",
  "de": "de-DE",
  "de-de": "de-DE",
  "de_de": "de-DE",
};

function normalizeLangFolder(name: string): string {
  const lower = name.toLowerCase();
  if (LANG_FOLDER_MAP[lower]) return LANG_FOLDER_MAP[lower];
  // Fall back to the vendor's own folder name, just hyphenated (e.g. "fr_FR" -> "fr-FR").
  return name.replace(/_/g, "-");
}

async function findFilesRecursive(dir: string, extension: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findFilesRecursive(fullPath, extension)));
    } else if (entry.name.toLowerCase().endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Imports a third-party ADMX template bundle (Chrome, Adobe Reader, ...)
 * uploaded as a .zip into the domain's Central Store. Unlike Microsoft's own
 * ADMX templates (installed once during provisioning from a known MSI
 * layout), third-party bundles come in whatever folder structure the vendor
 * chose — this walks the whole extracted tree looking for .admx/.adml files
 * rather than assuming a fixed layout.
 */
export async function importAdmxBundle(domainDn: string, zipFilePath: string): Promise<AdmxImportResult> {
  const policyDefsPath = getPolicyDefinitionsPath(domainDn);
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "admx-import-"));

  try {
    const unzipResult = await runCapture("unzip", ["-o", "-q", zipFilePath, "-d", tmpDir]);
    // unzip's exit code 1 just means "non-fatal warning" (e.g. harmless CRC
    // notices on some vendor zips) — only >=2 is a real extraction failure.
    if (unzipResult.exitCode >= 2) {
      throw new Error(`Konnte ZIP-Datei nicht entpacken: ${unzipResult.stderr || unzipResult.stdout}`);
    }

    const admxFiles = await findFilesRecursive(tmpDir, ".admx");
    if (admxFiles.length === 0) {
      throw new Error("Im hochgeladenen Archiv wurden keine .admx-Dateien gefunden.");
    }
    const admlFiles = await findFilesRecursive(tmpDir, ".adml");

    await fs.mkdir(policyDefsPath, { recursive: true });

    const admxFilesAdded: string[] = [];
    for (const admxFile of admxFiles) {
      const destName = path.basename(admxFile);
      await fs.copyFile(admxFile, path.join(policyDefsPath, destName));
      admxFilesAdded.push(destName);
    }

    const admlFilesAdded: string[] = [];
    for (const admlFile of admlFiles) {
      // The .adml's own parent folder name is the vendor's locale label
      // ("de-DE", "en", ...) — there's no other reliable signal for which
      // language a given .adml belongs to.
      const langFolder = normalizeLangFolder(path.basename(path.dirname(admlFile)));
      const destDir = path.join(policyDefsPath, langFolder);
      await fs.mkdir(destDir, { recursive: true });
      const destName = path.basename(admlFile);
      await fs.copyFile(admlFile, path.join(destDir, destName));
      admlFilesAdded.push(`${langFolder}/${destName}`);
    }

    const domainParts = domainDn.split(",").filter((p) => p.startsWith("DC="));
    const domainName = domainParts.map((p) => p.replace("DC=", "")).join(".");
    if (!existsSync(BUILD_ADMX_CACHE_SCRIPT)) {
      throw new Error(`build-admx-cache.py nicht gefunden unter ${BUILD_ADMX_CACHE_SCRIPT}.`);
    }
    const cacheResult = await runCapture("python3", [BUILD_ADMX_CACHE_SCRIPT, domainName]);
    if (cacheResult.exitCode !== 0) {
      throw new Error(`ADMX-Cache konnte nicht neu aufgebaut werden: ${cacheResult.stderr || cacheResult.stdout}`);
    }
    clearAdmxCache();

    return { admxFilesAdded, admlFilesAdded };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
