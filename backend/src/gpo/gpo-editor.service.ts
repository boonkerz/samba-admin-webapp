import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { GpoBackupManifest } from "@samba-admin/shared";
import { modify, buildChange, add, del, search, attrString } from "../directory/ldapClient.js";
import { runCapture } from "../exec/safeExec.js";
import { getGpoSddl, setGpoSddl } from "./gpo-dacl.js";

const SYSVOL_BASE = "/var/lib/samba/sysvol";

/**
 * Directories created via plain fs.mkdir() end up owned by this process's
 * unix user (root) instead of the Windows-mapped owner (e.g. "Domain
 * Admins") that Samba's SYSVOL ACL model expects — POSIX default ACLs only
 * propagate the ACE list to new children, not the owner/group fields, and
 * plain chown() alone isn't enough either since it never populates the NT
 * ACL security-descriptor xattr that smbd/GPME actually reads (leaves it
 * ENODATA). A mismatched/missing owner or ACL is enough to make a real
 * Windows GPME session fail to write into that folder (STATUS_INVALID_
 * PARAMETER), or silently hide the whole feature's tree node instead of
 * showing it empty.
 *
 * A targeted `samba-tool ntacl get <sibling> --as-sddl` + `ntacl set
 * <sddl> <newPath> --recursive` was tried first (sub-second) but copies the
 * sibling's raw security descriptor verbatim, including container-only
 * inherit flags (OICI) that aren't correctly flattened onto leaf files —
 * `samba-tool ntacl sysvolcheck` flags the result as mismatched, and it was
 * not reliably enough for GPME to write into on a real Windows client.
 * `sysvolreset` is Samba's own tool for exactly this repair: it recomputes
 * every SYSVOL object's owner + ACL from the GPO's AD-stored
 * nTSecurityDescriptor with correct NT ACL inheritance semantics, verified
 * to make GPME writes succeed. It takes no path argument — no way to scope
 * it to one GPO — and walks the whole SYSVOL tree (a few minutes on this
 * domain), so this call is deliberately gated by callers to only run once,
 * the first time a given SYSVOL directory is created.
 */
export async function fixNewSysvolDirAcl(): Promise<void> {
  const result = await runCapture("samba-tool", ["ntacl", "sysvolreset"]);
  if (result.exitCode !== 0) {
    // runCapture never throws on a nonzero exit — without this check a failed
    // reset was silently ignored and callers proceeded to register the GPO's
    // AD object anyway, leaving a root-owned, GPME-unwritable SYSVOL folder
    // with no indication anything went wrong.
    throw new Error(`samba-tool ntacl sysvolreset failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`);
  }
}

async function pathExists(p: string): Promise<boolean> {
  return fs.stat(p).then(
    () => true,
    () => false
  );
}

interface RegistryPolEntry {
  key: string;
  valueName: string;
  valueType: "REG_DWORD" | "REG_SZ" | "REG_EXPAND_SZ" | "REG_MULTI_SZ" | "REG_BINARY";
  value: string | number | Buffer;
}

interface GpoSettings {
  guid: string;
  displayName: string;
  machineSettings: RegistryPolEntry[];
  userSettings: RegistryPolEntry[];
  gptVersion: number;
}

// Registry.pol binary format constants
const POL_HEADER = Buffer.from("PReg");
const POL_VERSION = Buffer.from([0x01, 0x00, 0x00, 0x00]);

/**
 * Parse a Registry.pol file
 * Format: [Key;ValueName;Type;Size;Data]...
 * Each entry is enclosed in [ ] with fields separated by ; (0x3b 0x00 in UTF-16LE)
 */
function parseRegistryPol(buffer: Buffer): RegistryPolEntry[] {
  const entries: RegistryPolEntry[] = [];

  // Check header
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(POL_HEADER)) {
    return entries;
  }

  let offset = 8; // Skip header and version

  while (offset < buffer.length - 1) {
    // Look for opening bracket [ (0x5b 0x00 in UTF-16LE)
    if (buffer[offset] !== 0x5b || buffer[offset + 1] !== 0x00) {
      offset += 2;
      continue;
    }
    offset += 2; // Skip [

    // Read key name until ; (0x3b 0x00)
    const keyStart = offset;
    while (offset < buffer.length - 1) {
      if (buffer[offset] === 0x3b && buffer[offset + 1] === 0x00) break;
      offset += 2;
    }
    const key = buffer.subarray(keyStart, offset).toString("utf16le").replace(/\0+$/, "");
    offset += 2; // Skip ;

    // Read value name until ; (0x3b 0x00)
    const valueNameStart = offset;
    while (offset < buffer.length - 1) {
      if (buffer[offset] === 0x3b && buffer[offset + 1] === 0x00) break;
      offset += 2;
    }
    const valueName = buffer.subarray(valueNameStart, offset).toString("utf16le").replace(/\0+$/, "");
    offset += 2; // Skip ;

    // Read type (4 bytes)
    if (offset + 4 > buffer.length) break;
    const type = buffer.readUInt32LE(offset);
    offset += 4;
    offset += 2; // Skip ;

    // Read size (4 bytes)
    if (offset + 4 > buffer.length) break;
    const size = buffer.readUInt32LE(offset);
    offset += 4;
    offset += 2; // Skip ;

    // Read data
    if (offset + size > buffer.length) break;
    const data = buffer.subarray(offset, offset + size);
    offset += size;

    // Skip closing ] (0x5d 0x00)
    if (offset < buffer.length - 1 && buffer[offset] === 0x5d && buffer[offset + 1] === 0x00) {
      offset += 2;
    }

    let value: string | number | Buffer;
    let valueType: RegistryPolEntry["valueType"];

    switch (type) {
      case 4: // REG_DWORD
        valueType = "REG_DWORD";
        value = data.readUInt32LE(0);
        break;
      case 1: // REG_SZ
        valueType = "REG_SZ";
        value = data.toString("utf16le").replace(/\0+$/, "");
        break;
      case 2: // REG_EXPAND_SZ
        valueType = "REG_EXPAND_SZ";
        value = data.toString("utf16le").replace(/\0+$/, "");
        break;
      case 7: // REG_MULTI_SZ
        valueType = "REG_MULTI_SZ";
        value = data.toString("utf16le").replace(/\0+$/, "");
        break;
      default: // REG_BINARY and others
        valueType = "REG_BINARY";
        value = data;
        break;
    }

    entries.push({ key, valueName, valueType, value });
  }

  return entries;
}

/**
 * Create a Registry.pol buffer from entries
 * Format: PReg [Version] [Key;ValueName;Type;Size;Data]...
 */
function createRegistryPol(entries: RegistryPolEntry[]): Buffer {
  const parts: Buffer[] = [];

  // Header
  parts.push(POL_HEADER);
  parts.push(POL_VERSION);

  for (const entry of entries) {
    // Opening bracket [
    parts.push(Buffer.from("[", "utf16le"));

    // Key (UTF-16LE + null)
    parts.push(Buffer.from(entry.key + "\0", "utf16le"));

    // Separator ;
    parts.push(Buffer.from(";", "utf16le"));

    // Value name (UTF-16LE + null)
    parts.push(Buffer.from(entry.valueName + "\0", "utf16le"));

    // Separator ;
    parts.push(Buffer.from(";", "utf16le"));

    // Type (4 bytes)
    const typeBuffer = Buffer.alloc(4);
    let typeValue: number;
    switch (entry.valueType) {
      case "REG_DWORD":
        typeValue = 4;
        break;
      case "REG_SZ":
        typeValue = 1;
        break;
      case "REG_EXPAND_SZ":
        typeValue = 2;
        break;
      case "REG_MULTI_SZ":
        typeValue = 7;
        break;
      default:
        typeValue = 3; // REG_BINARY
    }
    typeBuffer.writeUInt32LE(typeValue);
    parts.push(typeBuffer);

    // Separator ;
    parts.push(Buffer.from(";", "utf16le"));

    // Value data
    let dataBuffer: Buffer;
    if (entry.valueType === "REG_DWORD") {
      dataBuffer = Buffer.alloc(4);
      dataBuffer.writeUInt32LE(entry.value as number);
    } else if (Buffer.isBuffer(entry.value)) {
      dataBuffer = entry.value;
    } else {
      dataBuffer = Buffer.from((entry.value as string) + "\0", "utf16le");
    }

    // Size (4 bytes)
    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeUInt32LE(dataBuffer.length);
    parts.push(sizeBuffer);

    // Separator ;
    parts.push(Buffer.from(";", "utf16le"));

    // Data
    parts.push(dataBuffer);

    // Closing bracket ]
    parts.push(Buffer.from("]", "utf16le"));
  }

  return Buffer.concat(parts);
}

/**
 * Get the SYSVOL path for a domain
 */
export function getSysvolPath(domainDn: string): string {
  const domainParts = domainDn.split(",").filter((p) => p.startsWith("DC="));
  const domainName = domainParts.map((p) => p.replace("DC=", "")).join(".");
  return path.join(SYSVOL_BASE, domainName, "Policies");
}

/**
 * List all GPOs with their settings
 */
export async function listGpoSettings(domainDn: string): Promise<GpoSettings[]> {
  const policiesPath = getSysvolPath(domainDn);

  try {
    const entries = await fs.readdir(policiesPath);
    const gpos: GpoSettings[] = [];

    for (const entry of entries) {
      if (!entry.startsWith("{")) continue;

      const gpoPath = path.join(policiesPath, entry);
      const guid = entry.replace(/[{}]/g, "");

      // Read GPT.INI
      let gptVersion = 0;
      let displayName = entry;
      try {
        const gptContent = await fs.readFile(path.join(gpoPath, "GPT.INI"), "utf-8");
        const versionMatch = gptContent.match(/Version=(\d+)/);
        if (versionMatch) gptVersion = parseInt(versionMatch[1]);
      } catch {}

      // Read Machine Registry.pol
      let machineSettings: RegistryPolEntry[] = [];
      try {
        const machinePol = await fs.readFile(path.join(gpoPath, "Machine", "Registry.pol"));
        machineSettings = parseRegistryPol(machinePol);
      } catch {}

      // Read User Registry.pol
      let userSettings: RegistryPolEntry[] = [];
      try {
        const userPol = await fs.readFile(path.join(gpoPath, "User", "Registry.pol"));
        userSettings = parseRegistryPol(userPol);
      } catch {}

      gpos.push({
        guid,
        displayName,
        machineSettings,
        userSettings,
        gptVersion,
      });
    }

    return gpos;
  } catch (err) {
    console.error("Failed to read GPO settings:", err);
    return [];
  }
}

/**
 * Get settings for a specific GPO
 */
export async function getGpoSetting(domainDn: string, guid: string): Promise<GpoSettings | null> {
  const policiesPath = getSysvolPath(domainDn);
  const gpoPath = path.join(policiesPath, `{${guid}}`);

  try {
    await fs.access(gpoPath);
  } catch {
    return null;
  }

  let gptVersion = 0;
  try {
    const gptContent = await fs.readFile(path.join(gpoPath, "GPT.INI"), "utf-8");
    const versionMatch = gptContent.match(/Version=(\d+)/);
    if (versionMatch) gptVersion = parseInt(versionMatch[1]);
  } catch {}

  let machineSettings: RegistryPolEntry[] = [];
  try {
    const machinePol = await fs.readFile(path.join(gpoPath, "Machine", "Registry.pol"));
    machineSettings = parseRegistryPol(machinePol);
  } catch {}

  let userSettings: RegistryPolEntry[] = [];
  try {
    const userPol = await fs.readFile(path.join(gpoPath, "User", "Registry.pol"));
    userSettings = parseRegistryPol(userPol);
  } catch {}

  return {
    guid,
    displayName: guid,
    machineSettings,
    userSettings,
    gptVersion,
  };
}

/**
 * Update machine settings for a GPO
 */
export async function updateMachineSettings(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  settings: RegistryPolEntry[]
): Promise<void> {
  const policiesPath = getSysvolPath(domainDn);
  const machinePath = path.join(policiesPath, `{${guid}}`, "Machine");

  // Ensure directory exists
  const isNewDir = !(await pathExists(machinePath));
  await fs.mkdir(machinePath, { recursive: true });

  // Write Registry.pol
  const polBuffer = createRegistryPol(settings);
  await fs.writeFile(path.join(machinePath, "Registry.pol"), polBuffer);

  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }

  // Update GPT.INI *and* AD's versionNumber attribute — Windows clients decide
  // whether to reprocess a GPO by comparing AD's versionNumber against their
  // locally cached version, not the SYSVOL file, so skipping this write means
  // edited settings are silently never picked up on a normal refresh cycle.
  await bumpGpoVersion(client, domainDn, policiesPath, guid, "machine");
}

/**
 * Update user settings for a GPO
 */
export async function updateUserSettings(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  settings: RegistryPolEntry[]
): Promise<void> {
  const policiesPath = getSysvolPath(domainDn);
  const userPath = path.join(policiesPath, `{${guid}}`, "User");

  // Ensure directory exists
  const isNewDir = !(await pathExists(userPath));
  await fs.mkdir(userPath, { recursive: true });

  // Write Registry.pol
  const polBuffer = createRegistryPol(settings);
  await fs.writeFile(path.join(userPath, "Registry.pol"), polBuffer);

  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }

  // Update GPT.INI *and* AD's versionNumber attribute (see comment above).
  await bumpGpoVersion(client, domainDn, policiesPath, guid, "user");
}

/**
 * Bumps a GPO's version after a settings change, in both places Windows
 * checks: SYSVOL's GPT.INI (a flat "[General]\nVersion=<n>" file) and the AD
 * `versionNumber` attribute on the GPO's LDAP object. Per MS-GPOL, the version
 * is a single 32-bit number combining two independent 16-bit counters —
 * machine version in the low word, user version in the high word — so only
 * the half that actually changed gets incremented.
 */
export async function bumpGpoVersion(
  client: ldap.Client,
  domainDn: string,
  policiesPath: string,
  guid: string,
  scope: "machine" | "user"
): Promise<void> {
  const gptPath = path.join(policiesPath, `{${guid}}`, "GPT.INI");

  let combined = 0;
  try {
    const content = await fs.readFile(gptPath, "utf-8");
    const match = content.match(/Version=(\d+)/);
    if (match) combined = parseInt(match[1], 10);
  } catch {}

  let machineVersion = combined & 0xffff;
  let userVersion = (combined >>> 16) & 0xffff;
  if (scope === "machine") machineVersion = (machineVersion + 1) & 0xffff;
  else userVersion = (userVersion + 1) & 0xffff;
  combined = ((userVersion << 16) | machineVersion) >>> 0;

  await fs.writeFile(gptPath, `[General]\nVersion=${combined}\n`);

  const gpoDn = `CN={${guid}},CN=Policies,CN=System,${domainDn}`;
  await modify(client, gpoDn, [buildChange("replace", "versionNumber", String(combined))]);
}

/**
 * Create a new GPO
 */
export async function createGpo(client: ldap.Client, domainDn: string, displayName: string): Promise<string> {
  const policiesPath = getSysvolPath(domainDn);
  const domainName = domainDn
    .split(",")
    .filter((p) => p.startsWith("DC="))
    .map((p) => p.replace("DC=", ""))
    .join(".");

  // Generate GUID
  const guid = crypto.randomUUID();
  const gpoPath = path.join(policiesPath, `{${guid}}`);

  // Register the GPO's AD object FIRST, using the caller's own already-
  // authenticated LDAP session (req.ldapClient, bound with the logged-in
  // admin's real credentials) rather than shelling out to `samba-tool gpo
  // create` with a hardcoded, broken "--password=***" placeholder — besides
  // never actually working, that also built its shell command via string
  // interpolation of `displayName` (user input), a command-injection hole.
  // A direct LDAP add needs no separate credential and matches how every
  // other write in this app already authenticates.
  //
  // This must happen before the SYSVOL folder is created/ACL-fixed below:
  // samba-tool ntacl sysvolreset derives each SYSVOL folder's correct NT
  // ACL by reading its matching AD groupPolicyContainer object's
  // nTSecurityDescriptor (a bare add() already gets a proper, GPO-style
  // default for this, inherited from the Policies container). Running the
  // ACL fix before this object existed left every fresh GPO's SYSVOL
  // folder with a generic, non-GPO ACL (no "Apply Group Policy" grant for
  // Authenticated Users, wrong owner) permanently, since sysvolreset had
  // nothing AD-side to copy from yet when it ran.
  await add(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, {
    objectClass: ["top", "container", "groupPolicyContainer"],
    cn: `{${guid}}`,
    displayName,
    gPCFileSysPath: `\\\\${domainName}\\sysvol\\${domainName}\\Policies\\{${guid}}`,
    gPCFunctionalityVersion: "2",
    flags: "0",
    versionNumber: "0",
  });

  // Create directory structure
  await fs.mkdir(path.join(gpoPath, "Machine"), { recursive: true });
  await fs.mkdir(path.join(gpoPath, "User"), { recursive: true });

  // Create GPT.INI
  const gptContent = `[General]\nVersion=0\ndisplayName=${displayName}\n`;
  await fs.writeFile(path.join(gpoPath, "GPT.INI"), gptContent);

  // Create empty Registry.pol files
  const emptyPol = createRegistryPol([]);
  await fs.writeFile(path.join(gpoPath, "Machine", "Registry.pol"), emptyPol);
  await fs.writeFile(path.join(gpoPath, "User", "Registry.pol"), emptyPol);

  // gpoPath is entirely new (fresh GUID), so its whole tree was just created
  // with plain fs.mkdir/fs.writeFile — fix ownership/ACLs now, once, rather
  // than per-file. The AD object above already exists by this point, so
  // sysvolreset can correctly derive this folder's ACL from it.
  await fixNewSysvolDirAcl();

  return guid;
}

/**
 * Delete a GPO
 */
export async function deleteGpo(client: ldap.Client, domainDn: string, guid: string): Promise<void> {
  const policiesPath = getSysvolPath(domainDn);
  const gpoPath = path.join(policiesPath, `{${guid}}`);

  // Remove from SYSVOL
  await fs.rm(gpoPath, { recursive: true, force: true });

  // Remove the AD object via the caller's authenticated LDAP session — see
  // createGpo's comment for why this replaced a broken samba-tool shell-out.
  await del(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`);
}

function gpoDnFor(domainDn: string, guid: string): string {
  return `CN={${guid}},CN=Policies,CN=System,${domainDn}`;
}

/**
 * Duplicates a GPO under a new GUID: copies its entire SYSVOL tree (Registry.pol, GPP preference
 * XML, everything), its DACL (matching real GPMC's "preserve existing permissions" copy option),
 * its WMI filter assignment, and its enabled/disabled status flags.
 */
export async function copyGpo(client: ldap.Client, domainDn: string, sourceGuid: string, newDisplayName: string): Promise<string> {
  const policiesPath = getSysvolPath(domainDn);
  const sourcePath = path.join(policiesPath, `{${sourceGuid}}`);
  const sourceGpoDn = gpoDnFor(domainDn, sourceGuid);

  const sourceSddl = await getGpoSddl(sourceGpoDn);
  const sourceEntries = await search(client, sourceGpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["flags", "gPCWQLFilter"] });
  const sourceFlags = attrString(sourceEntries[0]?.attributes ?? {}, "flags");
  const sourceWmiFilter = attrString(sourceEntries[0]?.attributes ?? {}, "gPCWQLFilter");

  const newGuid = await createGpo(client, domainDn, newDisplayName);
  const newPath = path.join(policiesPath, `{${newGuid}}`);
  const newGpoDn = gpoDnFor(domainDn, newGuid);

  // Overwrite the fresh skeleton createGpo() just wrote with the source's actual content.
  await fs.rm(newPath, { recursive: true, force: true });
  await fs.cp(sourcePath, newPath, { recursive: true });

  await writeGptDisplayName(newPath, newDisplayName);

  const changes = [];
  if (sourceFlags !== undefined) changes.push(buildChange("replace", "flags", sourceFlags));
  if (sourceWmiFilter) changes.push(buildChange("replace", "gPCWQLFilter", sourceWmiFilter));
  if (changes.length > 0) await modify(client, newGpoDn, changes);
  await setGpoSddl(newGpoDn, sourceSddl);

  // The copied files were written as plain fs.cp content, not through the
  // ACL-aware helpers above — fix ownership/ACLs on the whole tree now that
  // both the AD object and its final content exist for sysvolreset to copy from.
  await fixNewSysvolDirAcl();

  return newGuid;
}

async function writeGptDisplayName(gpoPath: string, displayName: string): Promise<void> {
  const gptPath = path.join(gpoPath, "GPT.INI");
  let content = await fs.readFile(gptPath, "utf-8").catch(() => "[General]\nVersion=0\n");
  content = /^displayName=/m.test(content) ? content.replace(/^displayName=.*$/m, `displayName=${displayName}`) : `${content}displayName=${displayName}\n`;
  await fs.writeFile(gptPath, content);
}

type GpoBackupFile = GpoBackupManifest["files"][number];

async function walkGpoFiles(dir: string, base: string): Promise<GpoBackupFile[]> {
  const out: GpoBackupFile[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walkGpoFiles(full, rel)));
    else out.push({ relativePath: rel, contentBase64: (await fs.readFile(full)).toString("base64") });
  }
  return out;
}

export async function backupGpo(client: ldap.Client, domainDn: string, guid: string): Promise<GpoBackupManifest> {
  const policiesPath = getSysvolPath(domainDn);
  const gpoPath = path.join(policiesPath, `{${guid}}`);
  const gpoDn = gpoDnFor(domainDn, guid);

  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: ["displayName", "flags", "gPCWQLFilter"] });
  const attrs = entries[0]?.attributes ?? {};
  const sddl = await getGpoSddl(gpoDn);
  const files = await walkGpoFiles(gpoPath, "");

  return {
    formatVersion: 1,
    sourceGuid: guid,
    displayName: attrString(attrs, "displayName") ?? guid,
    sddl,
    wmiFilterRaw: attrString(attrs, "gPCWQLFilter"),
    flags: attrString(attrs, "flags") ?? "0",
    backedUpAt: new Date().toISOString(),
    files,
  };
}

/**
 * Restores a backup manifest. If `asNew` is set (or the source GUID no longer exists), creates a
 * brand-new GPO instead of overwriting the original — mirroring real GPMC's distinction between
 * "Restore" (same GPO) and "Import Settings"/copy-in-as-new.
 */
export async function restoreGpo(
  client: ldap.Client,
  domainDn: string,
  manifest: GpoBackupManifest,
  options: { asNew: boolean; newDisplayName?: string }
): Promise<string> {
  const policiesPath = getSysvolPath(domainDn);
  const displayName = options.newDisplayName ?? manifest.displayName;

  let guid = manifest.sourceGuid;
  let gpoDn = gpoDnFor(domainDn, guid);
  const sourceStillExists = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)" })
    .then(() => true)
    .catch(() => false);

  if (options.asNew || !sourceStillExists) {
    guid = await createGpo(client, domainDn, displayName);
    gpoDn = gpoDnFor(domainDn, guid);
  }

  const gpoPath = path.join(policiesPath, `{${guid}}`);
  await fs.rm(gpoPath, { recursive: true, force: true });
  await fs.mkdir(gpoPath, { recursive: true });
  for (const file of manifest.files) {
    const full = path.join(gpoPath, file.relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.from(file.contentBase64, "base64"));
  }
  await writeGptDisplayName(gpoPath, displayName);

  const changes = [buildChange("replace", "displayName", displayName), buildChange("replace", "flags", manifest.flags)];
  await modify(client, gpoDn, changes).catch(() => {});
  if (manifest.wmiFilterRaw) await modify(client, gpoDn, [buildChange("replace", "gPCWQLFilter", manifest.wmiFilterRaw)]).catch(() => {});
  await setGpoSddl(gpoDn, manifest.sddl);

  await fixNewSysvolDirAcl();

  return guid;
}

/**
 * Common Administrative Template settings
 */
export const ADMIN_TEMPLATES = {
  computer: {
    "Windows-Komponenten": {
      "Windows Update": {
        "Automatische Updates konfigurieren": {
          key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
          valueName: "NoAutoUpdate",
          description: "Legt fest, ob automatische Updates aktiviert sind.",
          options: [
            { label: "Aktiviert", value: 0 },
            { label: "Deaktiviert", value: 1 },
          ],
        },
        "Benachrichtigung für geplante Neustarts": {
          key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU",
          valueName: "RebootRelaunchTimeoutEnabled",
          description: "Legt fest, ob Benutzer über geplante Neustarts benachrichtigt werden.",
          options: [
            { label: "Aktiviert", value: 1 },
            { label: "Deaktiviert", value: 0 },
          ],
        },
      },
      "Remoteverwaltung": {
        "WinRM-Dienst": {
          "Remoteserververwaltung zulassen": {
            key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Service",
            valueName: "AllowAutoConfig",
            description: "Ermöglicht die Fernverwaltung über WinRM.",
            options: [
              { label: "Aktiviert", value: 1 },
              { label: "Deaktiviert", value: 0 },
            ],
          },
        },
      },
    },
    "System": {
      "Gruppenrichtlinie": {
        "Hintergrundverarbeitung von Richtlinien": {
          key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Group Policy\\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}",
          valueName: "NoBackgroundPolicy",
          description: "Legt fest, ob Richtlinien im Hintergrund verarbeitet werden.",
          options: [
            { label: "Aktiviert", value: 0 },
            { label: "Deaktiviert", value: 1 },
          ],
        },
      },
      "Anmeldung": {
        "Anmeldehinweis anzeigen": {
          key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
          valueName: "legalnoticecaption",
          description: "Zeigt einen Hinweis vor der Anmeldung an.",
          type: "REG_SZ",
        },
      },
    },
    "Netzwerk": {
      "Netzwerkverbindungen": {
        "Windows-Firewall": {
          "Windows-Firewall aktivieren": {
            key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile",
            valueName: "EnableFirewall",
            description: "Aktiviert die Windows-Firewall für Domänenprofile.",
            options: [
              { label: "Aktiviert", value: 1 },
              { label: "Deaktiviert", value: 0 },
            ],
          },
        },
      },
    },
  },
  user: {
    "Systemsteuerung": {
      "Anzeige": {
        "Hintergrund": {
          key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
          valueName: "Wallpaper",
          description: "Legt den Hintergrund fest.",
          type: "REG_SZ",
        },
      },
    },
    "Startmenü und Taskleiste": {
      "Benachrichtigungen": {
        "Benachrichtigungen deaktivieren": {
          key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications",
          valueName: "NoToastApplicationNotification",
          description: "Deaktiviert Toast-Benachrichtigungen.",
          options: [
            { label: "Aktiviert", value: 1 },
            { label: "Deaktiviert", value: 0 },
          ],
        },
      },
    },
  },
};
