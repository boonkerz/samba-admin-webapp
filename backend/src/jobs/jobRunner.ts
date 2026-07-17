import { randomUUID } from "node:crypto";
import { mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import type { JobKind, JobLogLine, JobSnapshot, JobStatus } from "@samba-admin/shared";
import { runCapture, spawnStreaming, type ExecResult } from "../exec/safeExec.js";
import { config } from "../config.js";

interface JobRecord {
  jobId: string;
  kind: JobKind;
  status: JobStatus;
  lines: JobLogLine[];
  exitCode?: number;
  listeners: Set<(line: JobLogLine) => void>;
  doneListeners: Set<(status: JobStatus, exitCode: number) => void>;
  redact: string[];
  logFilePath: string;
  seq: number;
}

const jobs = new Map<string, JobRecord>();
let activeJobId: string | undefined;

export class JobAlreadyRunningError extends Error {
  constructor() {
    super("Another setup job is already running. Only one job may run at a time.");
    this.name = "JobAlreadyRunningError";
  }
}

function redactText(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join("***");
  }
  return result;
}

function assertNoActiveJob(): void {
  if (activeJobId) {
    const active = jobs.get(activeJobId);
    if (active && active.status === "running") {
      throw new JobAlreadyRunningError();
    }
  }
}

function createRecord(kind: JobKind, redact: string[]): JobRecord {
  const jobId = randomUUID();
  mkdirSync(config.jobLogDir, { recursive: true });
  const record: JobRecord = {
    jobId,
    kind,
    status: "running",
    lines: [],
    listeners: new Set(),
    doneListeners: new Set(),
    redact,
    logFilePath: path.join(config.jobLogDir, `${jobId}.log`),
    seq: 0,
  };
  jobs.set(jobId, record);
  activeJobId = jobId;
  return record;
}

function pushLine(record: JobRecord, stream: JobLogLine["stream"], text: string): void {
  const redacted = redactText(text, record.redact);
  const line: JobLogLine = { seq: record.seq++, stream, text: redacted, timestamp: new Date().toISOString() };
  record.lines.push(line);
  appendFileSync(record.logFilePath, `[${line.timestamp}] ${stream}: ${redacted}\n`);
  for (const listener of record.listeners) listener(line);
}

function finishRecord(record: JobRecord, status: "succeeded" | "failed", exitCode: number): void {
  record.status = status;
  record.exitCode = exitCode;
  pushLine(record, "meta", status === "succeeded" ? "Job completed successfully." : `Job failed (exit code ${exitCode}).`);
  for (const cb of record.doneListeners) cb(status, exitCode);
  if (activeJobId === record.jobId) activeJobId = undefined;
}

export interface StartJobOptions {
  /** Values (e.g. passwords) to replace with "***" before a line is stored/streamed. */
  redact?: string[];
}

/** Starts a job that runs a single long-lived streaming command. */
export function startJob(kind: JobKind, command: string, args: string[], options: StartJobOptions = {}): string {
  assertNoActiveJob();
  const record = createRecord(kind, options.redact ?? []);
  const argsForLog = args.map((a) => (options.redact?.includes(a) ? "***" : a)).join(" ");
  pushLine(record, "meta", `Starting: ${command} ${argsForLog}`);

  const handle = spawnStreaming(command, args);
  handle.onLine((stream, text) => pushLine(record, stream, text));
  handle.onExit((exitCode) => finishRecord(record, exitCode === 0 ? "succeeded" : "failed", exitCode));

  return record.jobId;
}

export interface JobContext {
  log(text: string): void;
  /** Spawns a long-lived command, streaming its output into the job's log; resolves with exit code. */
  runStreamed(command: string, args: string[], redactArgs?: string[]): Promise<number>;
  /** Runs a short command to completion, logging its output; resolves with the full result (does not throw on nonzero exit). */
  runQuick(command: string, args: string[], redactArgs?: string[]): Promise<ExecResult>;
}

/**
 * Starts a job that runs a multi-step executor function (e.g. provisioning:
 * samba-tool domain provision, then several systemctl/cp/rewrite steps),
 * all appended to a single continuous job log/stream.
 */
export function startExecutorJob(kind: JobKind, executor: (ctx: JobContext) => Promise<void>, options: StartJobOptions = {}): string {
  assertNoActiveJob();
  const record = createRecord(kind, options.redact ?? []);

  const ctx: JobContext = {
    log: (text) => pushLine(record, "meta", text),
    runStreamed: (command, args, redactArgs) => {
      const argsForLog = args.map((a) => (redactArgs?.includes(a) ? "***" : a)).join(" ");
      pushLine(record, "meta", `Running: ${command} ${argsForLog}`);
      return new Promise((resolve) => {
        const handle = spawnStreaming(command, args);
        handle.onLine((stream, text) => pushLine(record, stream, text));
        handle.onExit((exitCode) => resolve(exitCode));
      });
    },
    runQuick: async (command, args, redactArgs) => {
      const argsForLog = args.map((a) => (redactArgs?.includes(a) ? "***" : a)).join(" ");
      pushLine(record, "meta", `Running: ${command} ${argsForLog}`);
      const result = await runCapture(command, args);
      if (result.stdout.trim()) pushLine(record, "stdout", result.stdout.trim());
      if (result.stderr.trim()) pushLine(record, "stderr", result.stderr.trim());
      return result;
    },
  };

  executor(ctx)
    .then(() => finishRecord(record, "succeeded", 0))
    .catch((error: unknown) => {
      pushLine(record, "stderr", error instanceof Error ? error.message : String(error));
      finishRecord(record, "failed", 1);
    });

  return record.jobId;
}

export function getJobSnapshot(jobId: string): JobSnapshot | undefined {
  const record = jobs.get(jobId);
  if (!record) return undefined;
  return {
    jobId: record.jobId,
    kind: record.kind,
    status: record.status,
    lines: record.lines,
    exitCode: record.exitCode,
  };
}

/** Subscribes to new lines/completion of a job. Returns an unsubscribe function. */
export function subscribeJob(
  jobId: string,
  onLine: (line: JobLogLine) => void,
  onDone: (status: JobStatus, exitCode: number) => void
): (() => void) | undefined {
  const record = jobs.get(jobId);
  if (!record) return undefined;
  record.listeners.add(onLine);
  record.doneListeners.add(onDone);
  return () => {
    record.listeners.delete(onLine);
    record.doneListeners.delete(onDone);
  };
}

export function isJobRunning(): boolean {
  if (!activeJobId) return false;
  const record = jobs.get(activeJobId);
  return record?.status === "running";
}
