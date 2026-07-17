import { Store } from "express-session";
import type { SessionData } from "express-session";
import { config } from "../config.js";

interface Entry {
  data: SessionData;
  expiresAt: number;
}

/**
 * In-memory express-session Store. This is a single-process, single-admin
 * LAN appliance — sessions do not need to survive a process restart, and an
 * in-memory store avoids requiring a native module / build toolchain
 * (better-sqlite3 needs node-gyp + a C++ compiler) just for session storage.
 */
export class MemorySessionStore extends Store {
  private sessions = new Map<string, Entry>();
  private sweepTimer: NodeJS.Timeout;

  constructor() {
    super();
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    this.sweepTimer.unref();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [sid, entry] of this.sessions) {
      if (entry.expiresAt < now) this.sessions.delete(sid);
    }
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    const entry = this.sessions.get(sid);
    if (!entry || entry.expiresAt < Date.now()) return callback(null, null);
    callback(null, entry.data);
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    const maxAge = session.cookie?.maxAge ?? config.sessionTtlMs;
    this.sessions.set(sid, { data: session, expiresAt: Date.now() + maxAge });
    callback?.();
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.sessions.delete(sid);
    callback?.();
  }

  touch(sid: string, session: SessionData, callback?: (err?: unknown) => void): void {
    this.set(sid, session, callback);
  }
}
