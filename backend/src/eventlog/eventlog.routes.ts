import { Router } from "express";
import type { EventLogLevel } from "@samba-admin/shared";
import { queryEventLog, listEventLogSources } from "./eventlog.service.js";

export const eventLogRouter = Router();

eventLogRouter.use((req, res, next) => {
  if (!req.session.username) {
    return res.status(401).json({ error: "unauthenticated", message: "Login required." });
  }
  next();
});

eventLogRouter.get("/sources", (_req, res) => {
  res.json(listEventLogSources());
});

eventLogRouter.get("/entries", async (req, res, next) => {
  try {
    const level = req.query.level ? (String(req.query.level) as EventLogLevel) : undefined;
    const source = req.query.source ? String(req.query.source) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await queryEventLog({ level, source, search, limit }));
  } catch (err) {
    next(err);
  }
});
