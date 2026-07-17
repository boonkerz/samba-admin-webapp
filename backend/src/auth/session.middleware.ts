import session from "express-session";
import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { MemorySessionStore } from "./memorySessionStore.js";

const cookieSecretPath = path.join(config.configDir, "cookie-secret.key");

function getCookieSecret(): string {
  if (existsSync(cookieSecretPath)) return readFileSync(cookieSecretPath, "utf8").trim();
  mkdirSync(path.dirname(cookieSecretPath), { recursive: true });
  const secret = randomBytes(32).toString("hex");
  writeFileSync(cookieSecretPath, secret, { mode: 0o600 });
  return secret;
}

export const sessionMiddleware = session({
  store: new MemorySessionStore(),
  secret: getCookieSecret(),
  name: "samba_admin_sid",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    maxAge: config.sessionTtlMs,
  },
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.username) {
    res.status(401).json({ error: "not-authenticated", message: "Login required." });
    return;
  }
  next();
}
