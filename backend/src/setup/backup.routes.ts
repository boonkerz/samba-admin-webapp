import { Router } from "express";
import type { Request } from "express";
import { existsSync } from "node:fs";
import { decryptSecret } from "../auth/crypto.js";
import { auditLog } from "../directory/audit.js";
import { listBackups, getBackupFilePath, deleteBackup, startBackupJob } from "./backup.service.js";
import { getJobSnapshot, subscribeJob, isJobRunning } from "../jobs/jobRunner.js";
import { initSseResponse, writeSseEvent } from "../sse/sseHub.js";

export const backupRouter = Router();

backupRouter.use((req, res, next) => {
  if (!req.session.username || !req.session.encryptedPassword) {
    return res.status(401).json({ error: "unauthenticated", message: "Login required." });
  }
  next();
});

function actor(req: Request): string {
  return req.session.username ?? "unknown";
}

backupRouter.get("/list", (_req, res) => {
  res.json(listBackups());
});

backupRouter.post("/create", (req, res, next) => {
  try {
    if (isJobRunning()) {
      return res.status(409).json({ error: "job-running", message: "Es läuft bereits ein Vorgang." });
    }
    const password = decryptSecret(req.session.encryptedPassword!);
    const jobId = startBackupJob(req.session.username!, password);
    auditLog(actor(req), "create-domain-backup", jobId);
    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

backupRouter.get("/jobs/:jobId", (req, res) => {
  const snapshot = getJobSnapshot(req.params.jobId);
  if (!snapshot) return res.status(404).json({ error: "not-found", message: "Job not found." });
  res.json(snapshot);
});

backupRouter.get("/jobs/:jobId/stream", (req, res) => {
  const jobId = req.params.jobId;
  const snapshot = getJobSnapshot(jobId);
  if (!snapshot) {
    return res.status(404).json({ error: "not-found", message: "Job not found." });
  }

  initSseResponse(res);
  for (const line of snapshot.lines) {
    writeSseEvent(res, "line", line);
  }
  if (snapshot.status !== "running") {
    writeSseEvent(res, "done", { status: snapshot.status, exitCode: snapshot.exitCode });
    res.end();
    return;
  }

  const unsubscribe = subscribeJob(
    jobId,
    (line) => writeSseEvent(res, "line", line),
    (status, exitCode) => {
      writeSseEvent(res, "done", { status, exitCode });
      res.end();
    }
  );

  req.on("close", () => unsubscribe?.());
});

backupRouter.get("/download/:filename", (req, res) => {
  const filePath = getBackupFilePath(req.params.filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "not-found", message: "Sicherung nicht gefunden." });
  }
  res.download(filePath, req.params.filename);
});

backupRouter.delete("/:filename", (req, res) => {
  deleteBackup(req.params.filename);
  auditLog(actor(req), "delete-domain-backup", req.params.filename);
  res.json({ ok: true });
});
