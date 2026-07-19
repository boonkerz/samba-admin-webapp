import type { EventLogEntry, EventLogLevel, EventLogQuery } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";

/** Every systemd unit the Samba AD DC role and the optional print server touch — the closest equivalent to Windows Event Viewer's "System" log for this app. */
const SOURCES = ["samba-ad-dc", "smbd", "nmbd", "winbind", "cups"];

function levelFromPriority(priority: string | undefined): EventLogLevel {
  const n = Number(priority);
  if (Number.isNaN(n)) return "info";
  if (n <= 3) return "error"; // syslog emerg(0)/alert(1)/crit(2)/err(3)
  if (n === 4) return "warning"; // syslog warning(4)
  return "info"; // syslog notice(5)/info(6)/debug(7)
}

interface JournalEntryRaw {
  __REALTIME_TIMESTAMP?: string;
  MESSAGE?: string | number[];
  PRIORITY?: string;
  _SYSTEMD_UNIT?: string;
  SYSLOG_IDENTIFIER?: string;
}

function messageToString(message: JournalEntryRaw["MESSAGE"]): string {
  if (typeof message === "string") return message;
  // journalctl -o json encodes a MESSAGE field that isn't valid UTF-8 as an
  // array of raw byte values instead of a string — happens occasionally with
  // binary-ish samba log lines.
  if (Array.isArray(message)) return Buffer.from(message).toString("utf8");
  return "";
}

/**
 * Reads recent log entries for the units this app cares about via
 * `journalctl -o json` (merging multiple `-u` selectors sorts them
 * chronologically already). Filtering by level/search happens in-memory
 * after the journalctl call, same simplicity level as the audit log
 * (listAuditLog) — a `limit` cap, no real pagination.
 */
export async function queryEventLog(query: EventLogQuery = {}): Promise<EventLogEntry[]> {
  const limit = query.limit ?? 500;
  const sources = query.source ? [query.source] : SOURCES;
  const args: string[] = [];
  for (const unit of sources) args.push("-u", unit);
  args.push("-o", "json", "--no-pager", "-n", String(limit));

  const result = await runCapture("journalctl", args);
  const lines = result.stdout.split("\n").filter((line) => line.trim());

  let entries: EventLogEntry[] = lines
    .map((line): EventLogEntry | undefined => {
      try {
        const raw = JSON.parse(line) as JournalEntryRaw;
        const micros = Number(raw.__REALTIME_TIMESTAMP ?? 0);
        return {
          timestamp: new Date(micros / 1000).toISOString(),
          level: levelFromPriority(raw.PRIORITY),
          source: raw._SYSTEMD_UNIT ?? raw.SYSLOG_IDENTIFIER ?? "unknown",
          message: messageToString(raw.MESSAGE),
        };
      } catch {
        return undefined;
      }
    })
    .filter((e): e is EventLogEntry => e !== undefined);

  // Newest-first matches both the Windows Event Viewer default sort and this
  // app's own audit log convention.
  entries.reverse();

  if (query.level) entries = entries.filter((e) => e.level === query.level);
  if (query.search) {
    const needle = query.search.toLowerCase();
    entries = entries.filter((e) => e.message.toLowerCase().includes(needle) || e.source.toLowerCase().includes(needle));
  }

  return entries;
}

export function listEventLogSources(): string[] {
  return SOURCES;
}
