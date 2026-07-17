import { Router } from "express";
import type ldap from "ldapjs";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  listGpoSettings,
  getGpoSetting,
  updateMachineSettings,
  updateUserSettings,
  createGpo,
  deleteGpo,
  copyGpo,
  backupGpo,
  restoreGpo,
} from "./gpo-editor.service.js";
import type { GpoBackupManifest } from "@samba-admin/shared";
import {
  loadAdmxDefinitions,
  buildCategoryTree,
  getAdmxCategoriesByParent,
  getAdmxPoliciesByCategory,
  getPolicyDefinitionsPath,
} from "./admx.service.js";
import { importAdmxBundle } from "./admx-import.service.js";
import {
  listPrinterPreferences,
  createPrinterPreference,
  updatePrinterPreference,
  deletePrinterPreference,
} from "./gpp-printers.service.js";
import {
  listRegistryPreferences,
  createRegistryPreference,
  updateRegistryPreference,
  deleteRegistryPreference,
} from "./gpp-registry.service.js";
import { listGpoScripts, createGpoScript, updateGpoScript, deleteGpoScript } from "./gpo-scripts.service.js";
import {
  listDriveMapPreferences,
  createDriveMapPreference,
  updateDriveMapPreference,
  deleteDriveMapPreference,
} from "./gpp-drivemaps.service.js";
import {
  listScheduledTaskPreferences,
  createScheduledTaskPreference,
  updateScheduledTaskPreference,
  deleteScheduledTaskPreference,
  defaultScheduledTaskDefaults,
} from "./gpp-scheduledtasks.service.js";
import {
  listPowerOptionsPreferences,
  createPowerOptionsPreference,
  updatePowerOptionsPreference,
  deletePowerOptionsPreference,
} from "./gpp-poweroptions.service.js";
import {
  listEnvironmentVariablePreferences,
  createEnvironmentVariablePreference,
  updateEnvironmentVariablePreference,
  deleteEnvironmentVariablePreference,
} from "./gpp-envvars.service.js";
import {
  listShortcutPreferences,
  createShortcutPreference,
  updateShortcutPreference,
  deleteShortcutPreference,
} from "./gpp-shortcuts.service.js";
import { listFilePreferences, createFilePreference, updateFilePreference, deleteFilePreference } from "./gpp-files.service.js";
import {
  listFolderPreferences,
  createFolderPreference,
  updateFolderPreference,
  deleteFolderPreference,
} from "./gpp-folders.service.js";
import {
  listIniFilePreferences,
  createIniFilePreference,
  updateIniFilePreference,
  deleteIniFilePreference,
} from "./gpp-inifiles.service.js";
import {
  listLocalUserGroupPreferences,
  createLocalUserGroupPreference,
  updateLocalUserGroupPreference,
  deleteLocalUserGroupPreference,
} from "./gpp-localusergroups.service.js";
import {
  listFolderOptionsPreferences,
  createFolderOptionsPreference,
  updateFolderOptionsPreference,
  deleteFolderOptionsPreference,
} from "./gpp-folderoptions.service.js";
import {
  getRegionalOptionsPreference,
  setRegionalOptionsPreference,
  deleteRegionalOptionsPreference,
} from "./gpp-regionaloptions.service.js";
import {
  getStartMenuPreferences,
  setStartMenuXpPreference,
  setStartMenuVistaPreference,
  deleteStartMenuXpPreference,
  deleteStartMenuVistaPreference,
} from "./gpp-startmenu.service.js";
import {
  listNetworkOptionsPreferences,
  createNetworkOptionsPreference,
  updateNetworkOptionsPreference,
  deleteNetworkOptionsPreference,
} from "./gpp-networkoptions.service.js";
import {
  listDataSourcePreferences,
  createDataSourcePreference,
  updateDataSourcePreference,
  deleteDataSourcePreference,
} from "./gpp-datasources.service.js";
import { listDevicePreferences, createDevicePreference, updateDevicePreference, deleteDevicePreference } from "./gpp-devices.service.js";
import {
  listInternetSettingsPreferences,
  createInternetSettingsPreference,
  updateInternetSettingsPreference,
  deleteInternetSettingsPreference,
} from "./gpp-internetsettings.service.js";
import {
  listNetworkSharePreferences,
  createNetworkSharePreference,
  updateNetworkSharePreference,
  deleteNetworkSharePreference,
} from "./gpp-networkshares.service.js";
import { listServicePreferences, createServicePreference, updateServicePreference, deleteServicePreference } from "./gpp-services.service.js";
import { attachLdapClient } from "../directory/requestClient.middleware.js";
import { auditLog } from "../directory/audit.js";
import { createGpoLink } from "./gpo-scope.service.js";
import { rebind } from "../auth/auth.service.js";
import { decryptSecret } from "../auth/crypto.js";
import { startExecutorJob, getJobSnapshot, isJobRunning } from "../jobs/jobRunner.js";

export const gpoEditorRouter = Router();

gpoEditorRouter.use(attachLdapClient);

function actor(req: import("express").Request): string {
  return req.session.username ?? "unknown";
}

// List all GPO settings
gpoEditorRouter.get("/settings", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    res.json(await listGpoSettings(domainDn));
  } catch (err) {
    next(err);
  }
});

// Get settings for a specific GPO
gpoEditorRouter.get("/settings/:guid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const settings = await getGpoSetting(domainDn, req.params.guid);
    if (!settings) return res.status(404).json({ error: "not-found", message: "GPO not found." });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// Update machine settings
gpoEditorRouter.put("/settings/:guid/machine", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    await updateMachineSettings(req.ldapClient!, domainDn, req.params.guid, req.body);
    auditLog(actor(req), "update-gpo-machine", req.params.guid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update user settings
gpoEditorRouter.put("/settings/:guid/user", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    await updateUserSettings(req.ldapClient!, domainDn, req.params.guid, req.body);
    auditLog(actor(req), "update-gpo-user", req.params.guid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Create a new GPO (as a background job — creation involves a full
// `samba-tool ntacl sysvolreset` that takes several minutes; holding a
// single HTTP request open that long is fragile in practice (idle NAT/
// router connections get silently dropped well before it finishes, even
// though the server keeps working and completes the operation regardless).
// The frontend polls GET /jobs/:jobId instead of awaiting one long response.
gpoEditorRouter.post("/create-job", async (req, res, next) => {
  try {
    if (isJobRunning()) {
      return res.status(409).json({ error: "job-running", message: "Es läuft bereits ein Vorgang." });
    }
    const domainDn = req.baseDn!;
    const { displayName, linkToDn } = req.body as { displayName?: string; linkToDn?: string };
    if (!displayName) return res.status(400).json({ error: "bad-request", message: "displayName required." });

    const username = req.session.username!;
    const password = decryptSecret(req.session.encryptedPassword!);

    const jobId = startExecutorJob("gpo-create", async (ctx) => {
      const jobClient = await rebind(username, password);
      try {
        ctx.log(`Erstelle Gruppenrichtlinienobjekt "${displayName}"...`);
        const guid = await createGpo(jobClient, domainDn, displayName);
        if (linkToDn) {
          ctx.log("Verknüpfe mit Organisationseinheit...");
          await createGpoLink(jobClient, domainDn, guid, linkToDn);
        }
        ctx.log(`Fertig (GUID ${guid}).`);
      } finally {
        jobClient.unbind(() => {});
      }
    });

    auditLog(actor(req), "create-gpo-job", jobId, displayName);
    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.get("/jobs/:jobId", (req, res) => {
  const snapshot = getJobSnapshot(req.params.jobId);
  if (!snapshot) return res.status(404).json({ error: "not-found", message: "Job not found." });
  res.json(snapshot);
});

gpoEditorRouter.post("/:guid/copy-job", async (req, res, next) => {
  try {
    if (isJobRunning()) {
      return res.status(409).json({ error: "job-running", message: "Es läuft bereits ein Vorgang." });
    }
    const domainDn = req.baseDn!;
    const sourceGuid = req.params.guid;
    const { displayName } = req.body as { displayName?: string };
    if (!displayName) return res.status(400).json({ error: "bad-request", message: "displayName required." });

    const username = req.session.username!;
    const password = decryptSecret(req.session.encryptedPassword!);

    const jobId = startExecutorJob("gpo-copy", async (ctx) => {
      const jobClient = await rebind(username, password);
      try {
        ctx.log(`Kopiere Gruppenrichtlinienobjekt als "${displayName}"...`);
        const guid = await copyGpo(jobClient, domainDn, sourceGuid, displayName);
        ctx.log(`Fertig (GUID ${guid}).`);
      } finally {
        jobClient.unbind(() => {});
      }
    });

    auditLog(actor(req), "copy-gpo-job", jobId, `${sourceGuid} -> ${displayName}`);
    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.get("/:guid/backup", async (req, res, next) => {
  try {
    const manifest = await backupGpo(req.ldapClient!, req.baseDn!, req.params.guid);
    auditLog(actor(req), "backup-gpo", req.params.guid, manifest.displayName);
    const filename = `${manifest.displayName.replace(/[^\w.-]+/g, "_")}-${manifest.sourceGuid}.gpobackup.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(manifest);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/restore-job", async (req, res, next) => {
  try {
    if (isJobRunning()) {
      return res.status(409).json({ error: "job-running", message: "Es läuft bereits ein Vorgang." });
    }
    const domainDn = req.baseDn!;
    const { manifest, asNew, newDisplayName } = req.body as { manifest?: GpoBackupManifest; asNew?: boolean; newDisplayName?: string };
    if (!manifest || manifest.formatVersion !== 1) {
      return res.status(400).json({ error: "bad-request", message: "Gültiges Sicherungsmanifest erforderlich." });
    }

    const username = req.session.username!;
    const password = decryptSecret(req.session.encryptedPassword!);

    const jobId = startExecutorJob("gpo-restore", async (ctx) => {
      const jobClient = await rebind(username, password);
      try {
        ctx.log(`Stelle Gruppenrichtlinienobjekt "${manifest.displayName}" wieder her...`);
        const guid = await restoreGpo(jobClient, domainDn, manifest, { asNew: !!asNew, newDisplayName });
        ctx.log(`Fertig (GUID ${guid}).`);
      } finally {
        jobClient.unbind(() => {});
      }
    });

    auditLog(actor(req), "restore-gpo-job", jobId, manifest.displayName);
    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

// Delete a GPO
gpoEditorRouter.delete("/:guid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    await deleteGpo(req.ldapClient!, domainDn, req.params.guid);
    auditLog(actor(req), "delete-gpo", req.params.guid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Get root ADMX categories (lazy loading)
gpoEditorRouter.get("/admx-categories", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const definitions = await loadAdmxDefinitions(domainDn);
    const categories = buildCategoryTree(definitions);
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// Get child categories for a parent (lazy loading)
gpoEditorRouter.get("/admx-categories/:parentName", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const parentName = req.params.parentName;
    const definitions = await loadAdmxDefinitions(domainDn);
    const children = getAdmxCategoriesByParent(definitions, parentName);
    res.json(children);
  } catch (err) {
    next(err);
  }
});

// Get policies for a specific category
gpoEditorRouter.get("/admx-policies/:categoryName", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const categoryName = req.params.categoryName;
    const definitions = await loadAdmxDefinitions(domainDn);
    const policies = getAdmxPoliciesByCategory(definitions, categoryName);
    res.json(policies);
  } catch (err) {
    next(err);
  }
});

// Load all ADMX policies (for search)
gpoEditorRouter.get("/admx-policies", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const definitions = await loadAdmxDefinitions(domainDn);
    res.json(definitions.policies);
  } catch (err) {
    next(err);
  }
});

// --- ADMX-Vorlagen importieren (Chrome, Adobe, ...) ---
// No equivalent exists in real GPMC's modern Central-Store model (it has no
// "add templates" wizard at all) — this is a value-add on top of the
// Windows-parity baseline, letting an admin add third-party template
// bundles without manually touching SYSVOL over a file share.

const admxUpload = multer({ dest: path.join(os.tmpdir(), "samba-admin-admx-uploads"), limits: { fileSize: 300 * 1024 * 1024 } });

gpoEditorRouter.get("/admx-templates", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const policyDefsPath = getPolicyDefinitionsPath(domainDn);
    const entries = await fs.readdir(policyDefsPath, { withFileTypes: true }).catch(() => []);
    const fileNames = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".admx")).map((e) => e.name);
    res.json(fileNames.sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/admx-templates/import", admxUpload.single("file"), async (req, res, next) => {
  const file = req.file;
  try {
    const domainDn = req.baseDn!;
    if (!file) return res.status(400).json({ error: "bad-request", message: "ZIP-Datei erforderlich." });
    const result = await importAdmxBundle(domainDn, file.path);
    auditLog(actor(req), "import-admx-bundle", result.admxFilesAdded.join(", "));
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    if (file) await fs.rm(file.path, { force: true }).catch(() => {});
  }
});

// --- Group Policy Preferences: Printers (Systemsteuerungseinstellungen > Drucker) ---

gpoEditorRouter.get("/:guid/printers", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    res.json(await listPrinterPreferences(domainDn, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/printers", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const item = await createPrinterPreference(req.ldapClient!, domainDn, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-printer", req.params.guid, item.path);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/printers/:uid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const item = await updatePrinterPreference(req.ldapClient!, domainDn, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-printer", req.params.guid, item.path);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/printers/:uid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    await deletePrinterPreference(req.ldapClient!, domainDn, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-printer", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Registrierung (Einstellungen > Windows-Einstellungen > Registrierung) ---

function parseScope(req: import("express").Request, res: import("express").Response): "machine" | "user" | undefined {
  const scope = req.params.scope;
  if (scope !== "machine" && scope !== "user") {
    res.status(400).json({ error: "bad-request", message: "scope must be 'machine' or 'user'." });
    return undefined;
  }
  return scope;
}

gpoEditorRouter.get("/:guid/registry/:scope", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    res.json(await listRegistryPreferences(domainDn, req.params.guid, scope));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/registry/:scope", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    const item = await createRegistryPreference(req.ldapClient!, domainDn, req.params.guid, scope, req.body);
    auditLog(actor(req), "create-gpp-registry", req.params.guid, item.key);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/registry/:scope/:uid", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    const item = await updateRegistryPreference(req.ldapClient!, domainDn, req.params.guid, scope, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-registry", req.params.guid, item.key);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/registry/:scope/:uid", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    await deleteRegistryPreference(req.ldapClient!, domainDn, req.params.guid, scope, req.params.uid);
    auditLog(actor(req), "delete-gpp-registry", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy: Skripte (Richtlinien > Windows-Einstellungen > Skripte) ---

gpoEditorRouter.get("/:guid/scripts/:scope", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    res.json(await listGpoScripts(domainDn, req.params.guid, scope));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/scripts/:scope", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    const item = await createGpoScript(req.ldapClient!, domainDn, req.params.guid, scope, req.body);
    auditLog(actor(req), "create-gpo-script", req.params.guid, item.fileName);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/scripts/:scope/:uid", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    const item = await updateGpoScript(req.ldapClient!, domainDn, req.params.guid, scope, req.params.uid, req.body);
    auditLog(actor(req), "update-gpo-script", req.params.guid, item.fileName);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/scripts/:scope/:uid", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    await deleteGpoScript(req.ldapClient!, domainDn, req.params.guid, scope, req.params.uid);
    auditLog(actor(req), "delete-gpo-script", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Laufwerkzuordnungen (Einstellungen > Windows-Einstellungen > Laufwerkzuordnungen) ---

gpoEditorRouter.get("/:guid/drivemaps", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    res.json(await listDriveMapPreferences(domainDn, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/drivemaps", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const item = await createDriveMapPreference(req.ldapClient!, domainDn, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-drivemap", req.params.guid, item.path);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/drivemaps/:uid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const item = await updateDriveMapPreference(req.ldapClient!, domainDn, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-drivemap", req.params.guid, item.path);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/drivemaps/:uid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    await deleteDriveMapPreference(req.ldapClient!, domainDn, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-drivemap", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Geplante Aufgaben (Einstellungen > Systemsteuerungseinstellungen > Geplante Aufgaben) ---

gpoEditorRouter.get("/scheduledtasks-defaults", (_req, res) => {
  res.json(defaultScheduledTaskDefaults());
});

gpoEditorRouter.get("/:guid/scheduledtasks/:scope", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    res.json(await listScheduledTaskPreferences(domainDn, req.params.guid, scope));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/scheduledtasks/:scope", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    const item = await createScheduledTaskPreference(req.ldapClient!, domainDn, req.params.guid, scope, req.body);
    auditLog(actor(req), "create-gpp-scheduledtask", req.params.guid, item.name);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/scheduledtasks/:scope/:uid", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    const item = await updateScheduledTaskPreference(req.ldapClient!, domainDn, req.params.guid, scope, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-scheduledtask", req.params.guid, item.name);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/scheduledtasks/:scope/:uid", async (req, res, next) => {
  try {
    const scope = parseScope(req, res);
    if (!scope) return;
    const domainDn = req.baseDn!;
    await deleteScheduledTaskPreference(req.ldapClient!, domainDn, req.params.guid, scope, req.params.uid);
    auditLog(actor(req), "delete-gpp-scheduledtask", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Energieoptionen (Einstellungen > Systemsteuerungseinstellungen > Energieoptionen) ---

gpoEditorRouter.get("/:guid/poweroptions", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    res.json(await listPowerOptionsPreferences(domainDn, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/poweroptions", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const item = await createPowerOptionsPreference(req.ldapClient!, domainDn, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-poweroptions", req.params.guid, item.kind);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/poweroptions/:uid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    const item = await updatePowerOptionsPreference(req.ldapClient!, domainDn, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-poweroptions", req.params.guid, item.kind);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/poweroptions/:uid", async (req, res, next) => {
  try {
    const domainDn = req.baseDn!;
    await deletePowerOptionsPreference(req.ldapClient!, domainDn, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-poweroptions", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Umgebungsvariablen, Verknüpfungen, Dateien, Ordner, INI-Dateien ---
// All five are scope-aware (Computer + User) like Registry, so they share
// the same route shape: GET/POST /:guid/<kind>/:scope, PUT/DELETE .../:uid.

function makeScopedPreferenceRoutes<T>(
  kind: string,
  list: (domainDn: string, guid: string, scope: "machine" | "user") => Promise<T[]>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (client: ldap.Client, domainDn: string, guid: string, scope: "machine" | "user", data: any) => Promise<T>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (client: ldap.Client, domainDn: string, guid: string, scope: "machine" | "user", uid: string, data: any) => Promise<T>,
  del: (client: ldap.Client, domainDn: string, guid: string, scope: "machine" | "user", uid: string) => Promise<void>
): void {
  gpoEditorRouter.get(`/:guid/${kind}/:scope`, async (req, res, next) => {
    try {
      const scope = parseScope(req, res);
      if (!scope) return;
      res.json(await list(req.baseDn!, req.params.guid, scope));
    } catch (err) {
      next(err);
    }
  });

  gpoEditorRouter.post(`/:guid/${kind}/:scope`, async (req, res, next) => {
    try {
      const scope = parseScope(req, res);
      if (!scope) return;
      const item = await create(req.ldapClient!, req.baseDn!, req.params.guid, scope, req.body);
      auditLog(actor(req), `create-gpp-${kind}`, req.params.guid);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  gpoEditorRouter.put(`/:guid/${kind}/:scope/:uid`, async (req, res, next) => {
    try {
      const scope = parseScope(req, res);
      if (!scope) return;
      const item = await update(req.ldapClient!, req.baseDn!, req.params.guid, scope, req.params.uid, req.body);
      auditLog(actor(req), `update-gpp-${kind}`, req.params.guid);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  gpoEditorRouter.delete(`/:guid/${kind}/:scope/:uid`, async (req, res, next) => {
    try {
      const scope = parseScope(req, res);
      if (!scope) return;
      await del(req.ldapClient!, req.baseDn!, req.params.guid, scope, req.params.uid);
      auditLog(actor(req), `delete-gpp-${kind}`, req.params.guid, req.params.uid);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
}

makeScopedPreferenceRoutes(
  "envvars",
  listEnvironmentVariablePreferences,
  createEnvironmentVariablePreference,
  updateEnvironmentVariablePreference,
  deleteEnvironmentVariablePreference
);
makeScopedPreferenceRoutes("shortcuts", listShortcutPreferences, createShortcutPreference, updateShortcutPreference, deleteShortcutPreference);
makeScopedPreferenceRoutes("files", listFilePreferences, createFilePreference, updateFilePreference, deleteFilePreference);
makeScopedPreferenceRoutes("folders", listFolderPreferences, createFolderPreference, updateFolderPreference, deleteFolderPreference);
makeScopedPreferenceRoutes("inifiles", listIniFilePreferences, createIniFilePreference, updateIniFilePreference, deleteIniFilePreference);
makeScopedPreferenceRoutes(
  "localgroups",
  listLocalUserGroupPreferences,
  createLocalUserGroupPreference,
  updateLocalUserGroupPreference,
  deleteLocalUserGroupPreference
);
makeScopedPreferenceRoutes("devices", listDevicePreferences, createDevicePreference, updateDevicePreference, deleteDevicePreference);
makeScopedPreferenceRoutes(
  "internetsettings",
  listInternetSettingsPreferences,
  createInternetSettingsPreference,
  updateInternetSettingsPreference,
  deleteInternetSettingsPreference
);

// --- Group Policy Preferences: Netzwerkfreigaben (Einstellungen > Windows-Einstellungen > Netzwerkfreigaben) ---
// Computer-scope only, like Drive Maps is user-scope only — no :scope in the URL.

gpoEditorRouter.get("/:guid/networkshares", async (req, res, next) => {
  try {
    res.json(await listNetworkSharePreferences(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/networkshares", async (req, res, next) => {
  try {
    const item = await createNetworkSharePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-networkshare", req.params.guid, item.name);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/networkshares/:uid", async (req, res, next) => {
  try {
    const item = await updateNetworkSharePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-networkshare", req.params.guid, item.name);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/networkshares/:uid", async (req, res, next) => {
  try {
    await deleteNetworkSharePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-networkshare", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Dienste (Einstellungen > Systemsteuerungseinstellungen > Dienste) ---
// Computer-scope only, like Network Shares — no :scope in the URL.

gpoEditorRouter.get("/:guid/services", async (req, res, next) => {
  try {
    res.json(await listServicePreferences(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/services", async (req, res, next) => {
  try {
    const item = await createServicePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-service", req.params.guid, item.serviceName);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/services/:uid", async (req, res, next) => {
  try {
    const item = await updateServicePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-service", req.params.guid, item.serviceName);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/services/:uid", async (req, res, next) => {
  try {
    await deleteServicePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-service", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Ordneroptionen (Einstellungen > Systemsteuerungseinstellungen > Ordneroptionen) ---
// User-scope only, like Printers/PowerOptions — no :scope in the URL.

gpoEditorRouter.get("/:guid/folderoptions", async (req, res, next) => {
  try {
    res.json(await listFolderOptionsPreferences(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/folderoptions", async (req, res, next) => {
  try {
    const item = await createFolderOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-folderoptions", req.params.guid, item.kind);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/folderoptions/:uid", async (req, res, next) => {
  try {
    const item = await updateFolderOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-folderoptions", req.params.guid, item.kind);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/folderoptions/:uid", async (req, res, next) => {
  try {
    await deleteFolderOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-folderoptions", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Regionale Einstellungen (Einstellungen > Systemsteuerungseinstellungen > Regionale Einstellungen) ---
// Singleton item, user-scope only — no :uid in the URL.

gpoEditorRouter.get("/:guid/regionaloptions", async (req, res, next) => {
  try {
    const item = await getRegionalOptionsPreference(req.baseDn!, req.params.guid);
    res.json(item ?? null);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/regionaloptions", async (req, res, next) => {
  try {
    const item = await setRegionalOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "update-gpp-regionaloptions", req.params.guid, item.localeName);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/regionaloptions", async (req, res, next) => {
  try {
    await deleteRegionalOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid);
    auditLog(actor(req), "delete-gpp-regionaloptions", req.params.guid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Startmenü (Einstellungen > Systemsteuerungseinstellungen > Startmenü) ---
// Two independent singletons (XP/Vista), user-scope only.

gpoEditorRouter.get("/:guid/startmenu", async (req, res, next) => {
  try {
    res.json(await getStartMenuPreferences(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/startmenu/xp", async (req, res, next) => {
  try {
    const item = await setStartMenuXpPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "update-gpp-startmenu-xp", req.params.guid);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/startmenu/xp", async (req, res, next) => {
  try {
    await deleteStartMenuXpPreference(req.ldapClient!, req.baseDn!, req.params.guid);
    auditLog(actor(req), "delete-gpp-startmenu-xp", req.params.guid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/startmenu/vista", async (req, res, next) => {
  try {
    const item = await setStartMenuVistaPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "update-gpp-startmenu-vista", req.params.guid);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/startmenu/vista", async (req, res, next) => {
  try {
    await deleteStartMenuVistaPreference(req.ldapClient!, req.baseDn!, req.params.guid);
    auditLog(actor(req), "delete-gpp-startmenu-vista", req.params.guid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Netzwerkoptionen (Einstellungen > Systemsteuerungseinstellungen > Netzwerkoptionen) ---
// User-scope only, like Printers/PowerOptions/FolderOptions — no :scope in the URL.

gpoEditorRouter.get("/:guid/networkoptions", async (req, res, next) => {
  try {
    res.json(await listNetworkOptionsPreferences(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/networkoptions", async (req, res, next) => {
  try {
    const item = await createNetworkOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-networkoptions", req.params.guid, item.name);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/networkoptions/:uid", async (req, res, next) => {
  try {
    const item = await updateNetworkOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-networkoptions", req.params.guid, item.name);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/networkoptions/:uid", async (req, res, next) => {
  try {
    await deleteNetworkOptionsPreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-networkoptions", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Group Policy Preferences: Datenquellen (Einstellungen > Systemsteuerungseinstellungen > Datenquellen) ---
// User-scope only, like Printers/PowerOptions/FolderOptions/NetworkOptions — no :scope in the URL.

gpoEditorRouter.get("/:guid/datasources", async (req, res, next) => {
  try {
    res.json(await listDataSourcePreferences(req.baseDn!, req.params.guid));
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.post("/:guid/datasources", async (req, res, next) => {
  try {
    const item = await createDataSourcePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.body);
    auditLog(actor(req), "create-gpp-datasources", req.params.guid, item.dsn);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.put("/:guid/datasources/:uid", async (req, res, next) => {
  try {
    const item = await updateDataSourcePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid, req.body);
    auditLog(actor(req), "update-gpp-datasources", req.params.guid, item.dsn);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

gpoEditorRouter.delete("/:guid/datasources/:uid", async (req, res, next) => {
  try {
    await deleteDataSourcePreference(req.ldapClient!, req.baseDn!, req.params.guid, req.params.uid);
    auditLog(actor(req), "delete-gpp-datasources", req.params.guid, req.params.uid);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
