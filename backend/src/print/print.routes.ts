import { Router } from "express";
import type { Request } from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import dns from "node:dns";
import type { DriverArch } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";
import { attachLdapClient } from "../directory/requestClient.middleware.js";
import { auditLog } from "../directory/audit.js";
import { decryptSecret } from "../auth/crypto.js";
import type { NetCredentials } from "./net-print-tool.js";
import {
  createPrinter,
  deletePrinter,
  getPrinter,
  listDeviceUris,
  listPpdModels,
  listPrinters,
  setDefaultPrinter,
  setPrinterEnabled,
  updatePrinter,
} from "./cups.service.js";
import {
  associateDriverWithPrinter,
  deleteDriverPackage,
  listDriverPackages,
  removeDriverFromPrinter,
  uploadDriverPackage,
} from "./driver-upload.service.js";
import { getPrintServerStatus } from "./print-server-enable.service.js";

export const printRouter = Router();

printRouter.use(attachLdapClient);

function actor(req: Request): string {
  return req.session.username ?? "unknown";
}

function creds(req: Request): NetCredentials {
  return { username: req.session.username!, password: decryptSecret(req.session.encryptedPassword!) };
}

async function requireReady(req: Request, res: import("express").Response): Promise<boolean> {
  const status = await getPrintServerStatus();
  if (!status.ready) {
    res.status(409).json({ error: "print-server-not-ready", message: "Der Druckserver ist noch nicht eingerichtet." });
    return false;
  }
  return true;
}

const upload = multer({ dest: path.join(os.tmpdir(), "samba-admin-driver-uploads"), limits: { fileSize: 300 * 1024 * 1024 } });

printRouter.get("/printers", async (_req, res, next) => {
  try {
    res.json(await listPrinters());
  } catch (err) {
    next(err);
  }
});

printRouter.get("/printers/:name", async (req, res, next) => {
  try {
    const printer = await getPrinter(req.params.name);
    if (!printer) return res.status(404).json({ error: "not-found", message: "Drucker nicht gefunden." });
    res.json(printer);
  } catch (err) {
    next(err);
  }
});

printRouter.post("/printers", async (req, res, next) => {
  try {
    if (!(await requireReady(req, res))) return;
    await createPrinter(req.body);
    auditLog(actor(req), "print-create-queue", req.body.name, req.body.deviceUri);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.put("/printers/:name", async (req, res, next) => {
  try {
    if (!(await requireReady(req, res))) return;
    await updatePrinter(req.params.name, req.body);
    auditLog(actor(req), "print-update-queue", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.delete("/printers/:name", async (req, res, next) => {
  try {
    await deletePrinter(req.params.name);
    auditLog(actor(req), "print-delete-queue", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.post("/printers/:name/default", async (req, res, next) => {
  try {
    await setDefaultPrinter(req.params.name);
    auditLog(actor(req), "print-set-default", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.post("/printers/:name/enable", async (req, res, next) => {
  try {
    await setPrinterEnabled(req.params.name, true);
    auditLog(actor(req), "print-enable-queue", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.post("/printers/:name/disable", async (req, res, next) => {
  try {
    await setPrinterEnabled(req.params.name, false);
    auditLog(actor(req), "print-disable-queue", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.get("/discovery/device-uris", async (_req, res, next) => {
  try {
    res.json(await listDeviceUris());
  } catch (err) {
    next(err);
  }
});

printRouter.get("/discovery/models", async (req, res, next) => {
  try {
    res.json(await listPpdModels(req.query.query ? String(req.query.query) : undefined));
  } catch (err) {
    next(err);
  }
});

/** Extracts the IP from `nmblookup <name>` output, e.g. "192.168.178.54 wlansekretariat<00>". */
function parseNmblookupOutput(output: string): string | null {
  const match = output.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s/m);
  return match ? match[1] : null;
}

/**
 * Many real network printers are referenced by hostname rather than a
 * literal IP (e.g. a CUPS device URI like `lpd://wlansekretariat/...`) —
 * browsers can't do DNS/NetBIOS lookups themselves, so the GPO printer
 * dialog's "suggest from hosted printers" picker calls this to get an actual
 * IP to prefill instead of just echoing the hostname back. Tries DNS first,
 * then falls back to NetBIOS broadcast/WINS (`nmblookup`) — confirmed live
 * that some printer names on this network only resolve that way, not via
 * DNS at all. Best-effort throughout: if both fail, the caller falls back to
 * using the hostname with "DNS-Name verwenden" instead.
 */
printRouter.get("/discovery/resolve-host", async (req, res, next) => {
  try {
    const host = String(req.query.host ?? "").trim();
    if (!host) return res.status(400).json({ error: "bad-request", message: "host required." });

    try {
      const { address } = await dns.promises.lookup(host, { family: 4 });
      return res.json({ ip: address });
    } catch {
      // fall through to NetBIOS
    }

    const nmbResult = await runCapture("nmblookup", [host]);
    res.json({ ip: parseNmblookupOutput(nmbResult.stdout) });
  } catch (err) {
    next(err);
  }
});

printRouter.get("/drivers", (_req, res) => {
  res.json(listDriverPackages());
});

printRouter.post("/drivers/upload", upload.array("files", 50), async (req, res, next) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    if (!(await requireReady(req, res))) return;
    const arch = (req.body.arch as DriverArch) ?? "x64";
    const pkg = await uploadDriverPackage(
      files.map((f) => ({ originalname: f.originalname, path: f.path })),
      arch,
      req.body.displayName || undefined
    );
    auditLog(actor(req), "print-upload-driver", pkg.driverId, pkg.displayName);
    res.json(pkg);
  } catch (err) {
    next(err);
  } finally {
    await Promise.all(files.map((f) => fs.rm(f.path, { force: true }).catch(() => {})));
  }
});

printRouter.delete("/drivers/:driverId", async (req, res, next) => {
  try {
    await deleteDriverPackage(req.params.driverId);
    auditLog(actor(req), "print-delete-driver", req.params.driverId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.post("/printers/:name/driver", async (req, res, next) => {
  try {
    if (!(await requireReady(req, res))) return;
    await associateDriverWithPrinter(req.body.driverId, req.params.name, creds(req));
    auditLog(actor(req), "print-assign-driver", req.params.name, req.body.driverId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

printRouter.delete("/printers/:name/driver", (req, res) => {
  removeDriverFromPrinter(req.params.name);
  auditLog(actor(req), "print-unassign-driver", req.params.name);
  res.json({ ok: true });
});
