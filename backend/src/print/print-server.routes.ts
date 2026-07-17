import { Router } from "express";
import type { JobStartedResponse } from "@samba-admin/shared";
import { getJobSnapshot, subscribeJob, isJobRunning } from "../jobs/jobRunner.js";
import { initSseResponse, writeSseEvent } from "../sse/sseHub.js";
import { getPrintServerStatus, startPrintServerSetupJob } from "./print-server-enable.service.js";

export const printServerRouter = Router();

/**
 * Unlike setupRouter (which blocks all mutation once provisioned, since
 * replaying domain provisioning would destroy it), this feature must keep
 * working post-provision too — print serving is orthogonal to AD
 * provisioning and this is the only way to exercise it on an
 * already-provisioned box. Deliberately unauthenticated at every stage, same
 * trust boundary as the rest of /api/setup/*: the wizard calls this step
 * right after domain provisioning succeeds, before the browser has ever
 * logged in (provisioning creates the AD administrator account, it doesn't
 * establish a web session) — requiring a session here would make the wizard
 * step permanently unusable. Anyone who can reach this box's management
 * port already has strictly more power via the unauthenticated provisioning
 * step itself (arbitrary admin password), so gating only this action adds
 * no real protection, just breaks the wizard.
 */

printServerRouter.get("/status", async (_req, res, next) => {
  try {
    res.json(await getPrintServerStatus());
  } catch (err) {
    next(err);
  }
});

printServerRouter.post("/enable", (_req, res) => {
  if (isJobRunning()) {
    return res.status(409).json({ error: "job-running", message: "Another job is already running." });
  }
  const jobId = startPrintServerSetupJob();
  const response: JobStartedResponse = { jobId };
  res.json(response);
});

printServerRouter.get("/jobs/:jobId", (req, res) => {
  const snapshot = getJobSnapshot(req.params.jobId);
  if (!snapshot) return res.status(404).json({ error: "not-found", message: "Job not found." });
  res.json(snapshot);
});

printServerRouter.get("/jobs/:jobId/stream", (req, res) => {
  const jobId = req.params.jobId;
  const snapshot = getJobSnapshot(jobId);
  if (!snapshot) {
    res.status(404).json({ error: "not-found", message: "Job not found." });
    return;
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
