import { Router } from "express";
import type { Request } from "express";
import type { CreateFileShareRequest, FileShareValidationResult, FsAclEntry, ShareAce, UpdateFileShareRequest } from "@samba-admin/shared";
import { attachLdapClient } from "../directory/requestClient.middleware.js";
import { auditLog } from "../directory/audit.js";
import { startExecutorJob, getJobSnapshot, subscribeJob, isJobRunning } from "../jobs/jobRunner.js";
import { initSseResponse, writeSseEvent } from "../sse/sseHub.js";
import { createFileShare, deleteFileShare, getFileShare, listFileShares, updateFileShare, validateFileShareParams } from "./fileshares.service.js";
import { getShareAcl, setShareAcl } from "./shareAcl.service.js";
import { getFsAcl, setFsAcl } from "./fsAcl.service.js";
import { browseFolder, createFolder } from "./folderBrowser.service.js";

export const fileSharesRouter = Router();

fileSharesRouter.use(attachLdapClient);

function actor(req: Request): string {
  return req.session.username ?? "unknown";
}

fileSharesRouter.get("/", (_req, res) => {
  res.json(listFileShares());
});

fileSharesRouter.get("/:name", (req, res) => {
  const share = getFileShare(req.params.name);
  if (!share) return res.status(404).json({ error: "not-found", message: "Share not found." });
  res.json(share);
});

fileSharesRouter.post("/validate", (req, res) => {
  res.json(validateFileShareParams(req.body as CreateFileShareRequest));
});

fileSharesRouter.post("/", (req, res) => {
  if (isJobRunning()) {
    return res.status(409).json({ error: "job-running", message: "Another operation is already running." });
  }
  const params = req.body as CreateFileShareRequest;
  const validation: FileShareValidationResult = validateFileShareParams(params);
  if (!validation.valid) {
    return res.status(400).json({ error: "validation-failed", errors: validation.errors });
  }
  const jobId = startExecutorJob("fileshare-create", (ctx) => createFileShare(params, ctx.log));
  auditLog(actor(req), "fileshare-create", params.name, params.path);
  res.json({ jobId });
});

fileSharesRouter.put("/:name", (req, res) => {
  if (isJobRunning()) {
    return res.status(409).json({ error: "job-running", message: "Another operation is already running." });
  }
  const params = req.body as UpdateFileShareRequest;
  const jobId = startExecutorJob("fileshare-update", (ctx) => updateFileShare(req.params.name, params, ctx.log));
  auditLog(actor(req), "fileshare-update", req.params.name);
  res.json({ jobId });
});

fileSharesRouter.delete("/:name", (req, res) => {
  if (isJobRunning()) {
    return res.status(409).json({ error: "job-running", message: "Another operation is already running." });
  }
  const jobId = startExecutorJob("fileshare-delete", (ctx) => deleteFileShare(req.params.name, ctx.log));
  auditLog(actor(req), "fileshare-delete", req.params.name);
  res.json({ jobId });
});

fileSharesRouter.get("/jobs/:jobId", (req, res) => {
  const snapshot = getJobSnapshot(req.params.jobId);
  if (!snapshot) return res.status(404).json({ error: "not-found", message: "Job not found." });
  res.json(snapshot);
});

fileSharesRouter.get("/jobs/:jobId/stream", (req, res) => {
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

// Share-level permissions ("Share Permissions" tab) — immediate, no service
// restart involved, so a plain request/response suffices (no job needed).
fileSharesRouter.get("/:name/share-acl", async (req, res, next) => {
  try {
    res.json(await getShareAcl(req.params.name));
  } catch (err) {
    next(err);
  }
});

fileSharesRouter.put("/:name/share-acl", async (req, res, next) => {
  try {
    const aces = req.body.aces as ShareAce[];
    await setShareAcl(req.params.name, aces);
    auditLog(actor(req), "fileshare-set-share-permissions", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Filesystem ("NTFS-style") permissions on the share's underlying path —
// also immediate, no job needed.
fileSharesRouter.get("/:name/fs-acl", async (req, res, next) => {
  try {
    const share = getFileShare(req.params.name);
    if (!share) return res.status(404).json({ error: "not-found", message: "Share not found." });
    res.json(await getFsAcl(share.path));
  } catch (err) {
    next(err);
  }
});

fileSharesRouter.put("/:name/fs-acl", async (req, res, next) => {
  try {
    const share = getFileShare(req.params.name);
    if (!share) return res.status(404).json({ error: "not-found", message: "Share not found." });
    const entries = req.body.entries as FsAclEntry[];
    await setFsAcl(share.path, entries);
    auditLog(actor(req), "fileshare-set-fs-permissions", req.params.name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// "Browse For Folder" equivalent for picking a share's path — read-only
// listing plus an optional "New Folder" action, no job/audit needed.
fileSharesRouter.get("/browse/list", (req, res, next) => {
  try {
    res.json(browseFolder(String(req.query.path ?? "/")));
  } catch (err) {
    next(err);
  }
});

fileSharesRouter.post("/browse/mkdir", (req, res, next) => {
  try {
    const { parentPath, name } = req.body as { parentPath: string; name: string };
    const created = createFolder(parentPath, name);
    auditLog(actor(req), "fileshare-create-folder", created);
    res.json(browseFolder(created));
  } catch (err) {
    next(err);
  }
});
