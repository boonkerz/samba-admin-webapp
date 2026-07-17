import { Router } from "express";
import type {
  JobStartedResponse,
  PreflightFixRequest,
  ProvisionParams,
  SetupStateResponse,
} from "@samba-admin/shared";
import { getProvisionState, readProvisionSummary } from "../state/provisionState.js";
import { detectDistro } from "./distro.service.js";
import { runPreflight, applyPreflightFixes } from "./preflight.service.js";
import { startPackageInstallJob } from "./packages.service.js";
import { startProvisionJob, validateProvisionParams } from "./provision.service.js";
import { getJobSnapshot, subscribeJob, isJobRunning } from "../jobs/jobRunner.js";
import { initSseResponse, writeSseEvent } from "../sse/sseHub.js";
import { runCapture } from "../exec/safeExec.js";

export const setupRouter = Router();

/**
 * Blocks mutating wizard routes once the box is already provisioned (replaying
 * provision would destroy the domain). Read-only status endpoints stay open so
 * the wizard's own finish screen can still read the job stream/summary right
 * after the state flips to "provisioned".
 */
const READ_ONLY_PREFIXES = ["/state", "/summary", "/jobs"];
setupRouter.use(async (req, res, next) => {
  if (READ_ONLY_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return next();
  }
  const state = await getProvisionState();
  if (state === "provisioned") {
    return res.status(409).json({ error: "already-provisioned", message: "This server is already provisioned as an AD DC." });
  }
  next();
});

setupRouter.get("/state", async (_req, res) => {
  const state = await getProvisionState();
  let response: SetupStateResponse = { state };
  if (state === "unprovisioned") {
    try {
      const distro = detectDistro();
      response = { ...response, distro: distro.prettyName, distroVersion: distro.version };
    } catch {
      // distro detection failure is surfaced by /preflight instead
    }
  }
  res.json(response);
});

setupRouter.get("/preflight", async (_req, res, next) => {
  try {
    res.json(await runPreflight());
  } catch (err) {
    next(err);
  }
});

setupRouter.post("/preflight/fix", async (req, res, next) => {
  try {
    const body = req.body as PreflightFixRequest;
    res.json(await applyPreflightFixes(body.actions ?? []));
  } catch (err) {
    next(err);
  }
});

setupRouter.post("/packages/install", async (req, res, next) => {
  try {
    if (isJobRunning()) {
      return res.status(409).json({ error: "job-running", message: "A setup job is already running." });
    }
    const dnsBackend = (req.body?.dnsBackend as "SAMBA_INTERNAL" | "BIND9_DLZ") ?? "SAMBA_INTERNAL";
    const jobId = await startPackageInstallJob(dnsBackend);
    const body: JobStartedResponse = { jobId };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

setupRouter.post("/provision/validate", (req, res) => {
  const params = req.body as ProvisionParams & { adminPasswordConfirm: string };
  res.json(validateProvisionParams(params));
});

setupRouter.post("/provision", (req, res) => {
  if (isJobRunning()) {
    return res.status(409).json({ error: "job-running", message: "A setup job is already running." });
  }
  const body = req.body as ProvisionParams & { adminPasswordConfirm: string };
  const validation = validateProvisionParams(body);
  if (!validation.valid) {
    return res.status(400).json({ error: "invalid-params", message: "Provisioning parameters are invalid.", errors: validation.errors });
  }
  const jobId = startProvisionJob(body);
  const response: JobStartedResponse = { jobId };
  res.json(response);
});

setupRouter.get("/jobs/:jobId", (req, res) => {
  const snapshot = getJobSnapshot(req.params.jobId);
  if (!snapshot) return res.status(404).json({ error: "not-found", message: "Job not found." });
  res.json(snapshot);
});

setupRouter.get("/jobs/:jobId/stream", (req, res) => {
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

setupRouter.get("/summary", (_req, res) => {
  const summary = readProvisionSummary();
  if (!summary) return res.status(404).json({ error: "not-provisioned", message: "Not provisioned yet." });
  res.json(summary);
});

setupRouter.post("/reboot", async (_req, res, next) => {
  try {
    res.json({ ok: true });
    await runCapture("systemctl", ["reboot"]);
  } catch (err) {
    next(err);
  }
});
