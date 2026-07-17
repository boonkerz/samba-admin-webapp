import { Router } from "express";
import { attachLdapClient } from "./requestClient.middleware.js";
import { auditLog } from "./audit.js";
import {
  listSites,
  createSite,
  deleteSite,
  listSubnets,
  createSubnet,
  updateSubnetSite,
  deleteSubnet,
  listSiteLinks,
  createSiteLink,
  updateSiteLink,
  deleteSiteLink,
} from "./sites.service.js";
import { listTrusts } from "./trusts.service.js";

export const sitesRouter = Router();

sitesRouter.use(attachLdapClient);

function actor(req: import("express").Request): string {
  return req.session.username ?? "unknown";
}

sitesRouter.get("/sites", async (req, res, next) => {
  try {
    res.json(await listSites(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

sitesRouter.post("/sites", async (req, res, next) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    if (!name) return res.status(400).json({ error: "bad-request", message: "name required." });
    const dn = await createSite(req.ldapClient!, req.baseDn!, name, description);
    auditLog(actor(req), "create-site", dn, name);
    res.status(201).json({ dn });
  } catch (err) {
    next(err);
  }
});

sitesRouter.delete("/sites/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteSite(req.ldapClient!, dn);
    auditLog(actor(req), "delete-site", dn);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

sitesRouter.get("/subnets", async (req, res, next) => {
  try {
    res.json(await listSubnets(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

sitesRouter.post("/subnets", async (req, res, next) => {
  try {
    const { name, siteDn, description } = req.body as { name?: string; siteDn?: string; description?: string };
    if (!name) return res.status(400).json({ error: "bad-request", message: "name required." });
    const dn = await createSubnet(req.ldapClient!, req.baseDn!, name, siteDn, description);
    auditLog(actor(req), "create-subnet", dn, name);
    res.status(201).json({ dn });
  } catch (err) {
    next(err);
  }
});

sitesRouter.put("/subnets/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    const { siteDn } = req.body as { siteDn: string | null };
    await updateSubnetSite(req.ldapClient!, dn, siteDn);
    auditLog(actor(req), "update-subnet-site", dn, siteDn ?? "none");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

sitesRouter.delete("/subnets/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteSubnet(req.ldapClient!, dn);
    auditLog(actor(req), "delete-subnet", dn);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

sitesRouter.get("/site-links", async (req, res, next) => {
  try {
    res.json(await listSiteLinks(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});

sitesRouter.post("/site-links", async (req, res, next) => {
  try {
    const { name, siteDns, cost, replicationIntervalMinutes } = req.body as {
      name?: string;
      siteDns?: string[];
      cost?: number;
      replicationIntervalMinutes?: number;
    };
    if (!name || !siteDns || siteDns.length < 2) {
      return res.status(400).json({ error: "bad-request", message: "name and at least two siteDns required." });
    }
    const dn = await createSiteLink(req.ldapClient!, req.baseDn!, name, siteDns, cost ?? 100, replicationIntervalMinutes ?? 180);
    auditLog(actor(req), "create-site-link", dn, name);
    res.status(201).json({ dn });
  } catch (err) {
    next(err);
  }
});

sitesRouter.put("/site-links/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await updateSiteLink(req.ldapClient!, dn, req.body as { siteDns?: string[]; cost?: number; replicationIntervalMinutes?: number });
    auditLog(actor(req), "update-site-link", dn);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

sitesRouter.delete("/site-links/:dn", async (req, res, next) => {
  try {
    const dn = decodeURIComponent(req.params.dn);
    await deleteSiteLink(req.ldapClient!, dn);
    auditLog(actor(req), "delete-site-link", dn);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

sitesRouter.get("/trusts", async (req, res, next) => {
  try {
    res.json(await listTrusts(req.ldapClient!, req.baseDn!));
  } catch (err) {
    next(err);
  }
});
