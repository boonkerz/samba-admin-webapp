import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { AuditEntry } from "@samba-admin/shared";

export function auditLog(actor: string, operation: string, targetDn: string, detail?: string): void {
  mkdirSync(path.dirname(config.auditLogPath), { recursive: true });
  const entry: AuditEntry = { timestamp: new Date().toISOString(), actor, operation, targetDn, detail };
  appendFileSync(config.auditLogPath, `${JSON.stringify(entry)}\n`);
}

export function listAuditLog(options: { limit?: number; actor?: string; operation?: string; search?: string } = {}): AuditEntry[] {
  let content: string;
  try {
    content = readFileSync(config.auditLogPath, "utf-8");
  } catch {
    return [];
  }

  let entries: AuditEntry[] = content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is AuditEntry => e !== null);

  entries.reverse(); // newest first

  if (options.actor) entries = entries.filter((e) => e.actor === options.actor);
  if (options.operation) entries = entries.filter((e) => e.operation === options.operation);
  if (options.search) {
    const q = options.search.toLowerCase();
    entries = entries.filter(
      (e) => e.targetDn.toLowerCase().includes(q) || (e.detail ?? "").toLowerCase().includes(q) || e.operation.toLowerCase().includes(q)
    );
  }

  return options.limit ? entries.slice(0, options.limit) : entries;
}

/** Distinct actor/operation values across the whole log, for filter dropdowns. */
export function getAuditLogFacets(): { actors: string[]; operations: string[] } {
  const all = listAuditLog();
  return {
    actors: [...new Set(all.map((e) => e.actor))].sort(),
    operations: [...new Set(all.map((e) => e.operation))].sort(),
  };
}
