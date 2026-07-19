export type EventLogLevel = "error" | "warning" | "info";

/** systemd units this app knows to look at — everything the Samba AD DC role and the optional print server touch. */
export type EventLogSource = "samba-ad-dc" | "smbd" | "nmbd" | "winbind" | "cups";

export interface EventLogEntry {
  timestamp: string;
  level: EventLogLevel;
  source: string;
  message: string;
}

export interface EventLogQuery {
  level?: EventLogLevel;
  source?: string;
  search?: string;
  limit?: number;
}
