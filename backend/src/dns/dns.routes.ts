import { Router } from "express";
import type { Request } from "express";
import type { DnsRecordType } from "@samba-admin/shared";
import { attachLdapClient } from "../directory/requestClient.middleware.js";
import { auditLog } from "../directory/audit.js";
import { decryptSecret } from "../auth/crypto.js";
import {
  listZones,
  getZoneInfo,
  createZone,
  deleteZone,
  setZoneOptions,
  queryChildren,
  addRecord,
  updateRecord,
  deleteRecord,
  formatRecordData,
} from "./dns.service.js";
import type { DnsCredentials } from "./dns-tool.js";
import { getForwarders, setForwarders, restartDnsService } from "./dns-forwarders.service.js";

export const dnsRouter = Router();

dnsRouter.use(attachLdapClient);

function actor(req: Request): string {
  return req.session.username ?? "unknown";
}

function creds(req: Request): DnsCredentials {
  return { username: req.session.username!, password: decryptSecret(req.session.encryptedPassword!) };
}

dnsRouter.get("/zones", async (req, res, next) => {
  try {
    res.json(await listZones(creds(req)));
  } catch (err) {
    next(err);
  }
});

dnsRouter.get("/zones/:zone", async (req, res, next) => {
  try {
    res.json(await getZoneInfo(creds(req), req.params.zone));
  } catch (err) {
    next(err);
  }
});

dnsRouter.post("/zones", async (req, res, next) => {
  try {
    const { zoneName, directoryPartition } = req.body as { zoneName?: string; directoryPartition?: "domain" | "forest" };
    if (!zoneName) return res.status(400).json({ error: "bad-request", message: "zoneName required." });
    await createZone(creds(req), zoneName, { directoryPartition });
    auditLog(actor(req), "dns-create-zone", zoneName);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

dnsRouter.delete("/zones/:zone", async (req, res, next) => {
  try {
    await deleteZone(creds(req), req.params.zone);
    auditLog(actor(req), "dns-delete-zone", req.params.zone);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

dnsRouter.put("/zones/:zone/options", async (req, res, next) => {
  try {
    const { aging, norefreshinterval, refreshinterval } = req.body as {
      aging?: boolean;
      norefreshinterval?: number;
      refreshinterval?: number;
    };
    await setZoneOptions(creds(req), req.params.zone, {
      aging,
      noRefreshIntervalHours: norefreshinterval,
      refreshIntervalHours: refreshinterval,
    });
    auditLog(actor(req), "dns-zone-options", req.params.zone);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

dnsRouter.get("/zones/:zone/nodes/:name", async (req, res, next) => {
  try {
    res.json(await queryChildren(creds(req), req.params.zone, req.params.name));
  } catch (err) {
    next(err);
  }
});

dnsRouter.post("/zones/:zone/records", async (req, res, next) => {
  try {
    const { name, type, fields, data } = req.body as {
      name?: string;
      type?: DnsRecordType;
      fields?: Record<string, string | number | string[]>;
      data?: string;
    };
    if (!name || !type) return res.status(400).json({ error: "bad-request", message: "name and type required." });
    const dataString = data ?? formatRecordData(type, fields ?? {});
    await addRecord(creds(req), req.params.zone, name, type, dataString);
    auditLog(actor(req), "dns-add-record", `${name}.${req.params.zone}`, `${type} ${dataString}`);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

dnsRouter.put("/zones/:zone/records", async (req, res, next) => {
  try {
    const { name, type, oldData, newFields, newData } = req.body as {
      name?: string;
      type?: DnsRecordType;
      oldData?: string;
      newFields?: Record<string, string | number | string[]>;
      newData?: string;
    };
    if (!name || !type || !oldData) return res.status(400).json({ error: "bad-request", message: "name, type and oldData required." });
    const newDataString = newData ?? formatRecordData(type, newFields ?? {});
    await updateRecord(creds(req), req.params.zone, name, type, oldData, newDataString);
    auditLog(actor(req), "dns-update-record", `${name}.${req.params.zone}`, `${type} ${oldData} -> ${newDataString}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

dnsRouter.delete("/zones/:zone/records", async (req, res, next) => {
  try {
    const { name, type, data } = req.body as { name?: string; type?: DnsRecordType; data?: string };
    if (!name || !type || !data) return res.status(400).json({ error: "bad-request", message: "name, type and data required." });
    await deleteRecord(creds(req), req.params.zone, name, type, data);
    auditLog(actor(req), "dns-delete-record", `${name}.${req.params.zone}`, `${type} ${data}`);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

dnsRouter.get("/server/forwarders", async (_req, res, next) => {
  try {
    res.json(await getForwarders());
  } catch (err) {
    next(err);
  }
});

dnsRouter.put("/server/forwarders", async (req, res, next) => {
  try {
    const { ips } = req.body as { ips?: string[] };
    setForwarders(ips ?? []);
    auditLog(actor(req), "dns-set-forwarders", "server", (ips ?? []).join(" ") || "(none)");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

dnsRouter.post("/server/restart", async (req, res, next) => {
  try {
    await restartDnsService();
    auditLog(actor(req), "dns-restart-service", "server");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
