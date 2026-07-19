import { Router } from "express";
import type { Request } from "express";
import { attachLdapClient } from "../directory/requestClient.middleware.js";
import { auditLog } from "../directory/audit.js";
import { decryptSecret } from "../auth/crypto.js";
import { checkDemoteEligibility, startDemoteJob } from "./demote.service.js";
import { getJobSnapshot, subscribeJob, isJobRunning } from "../jobs/jobRunner.js";
import { initSseResponse, writeSseEvent } from "../sse/sseHub.js";

export const demoteRouter = Router();

// attachLdapClient requires both a logged-in session and an already-
// provisioned domain — exactly the precondition demoting needs anyway.
demoteRouter.use(attachLdapClient);

function actor(req: Request): string {
  return req.session.username ?? "unknown";
}

demoteRouter.get("/eligibility", async (req, res, next) => {
  try {
    res.json(await checkDemoteEligibility(req.ldapClient!));
  } catch (err) {
    next(err);
  }
});

demoteRouter.post("/", async (req, res, next) => {
  try {
    if (isJobRunning()) {
      return res.status(409).json({ error: "job-running", message: "Es läuft bereits ein Vorgang." });
    }
    const eligibility = await checkDemoteEligibility(req.ldapClient!);
    if (!eligibility.eligible) {
      return res.status(409).json({ error: "not-eligible", message: eligibility.reason });
    }
    const password = decryptSecret(req.session.encryptedPassword!);
    const jobId = startDemoteJob(req.session.username!, password);
    auditLog(actor(req), "demote-domain-controller", "self");
    res.json({ jobId });
  } catch (err) {
    next(err);
  }
});

demoteRouter.get("/jobs/:jobId", (req, res) => {
  const snapshot = getJobSnapshot(req.params.jobId);
  if (!snapshot) return res.status(404).json({ error: "not-found", message: "Job not found." });
  res.json(snapshot);
});

demoteRouter.get("/jobs/:jobId/stream", (req, res) => {
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
