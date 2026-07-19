import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { sessionMiddleware } from "./auth/session.middleware.js";
import { setupRouter } from "./setup/setup.routes.js";
import { authRouter } from "./auth/auth.routes.js";
import { directoryRouter } from "./directory/directory.routes.js";
import { gpoEditorRouter } from "./gpo/gpo-editor.routes.js";
import { dnsRouter } from "./dns/dns.routes.js";
import { sitesRouter } from "./directory/sites.routes.js";
import { printServerRouter } from "./print/print-server.routes.js";
import { printRouter } from "./print/print.routes.js";
import { eventLogRouter } from "./eventlog/eventlog.routes.js";
import { demoteRouter } from "./setup/demote.routes.js";
import { backupRouter } from "./setup/backup.routes.js";
import { config } from "./config.js";

export function createServer(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Default 100kb is too small for GPO backup/restore manifests (base64-embedded SYSVOL trees).
  app.use(express.json({ limit: "50mb" }));
  app.use(sessionMiddleware);

  app.use("/api/setup", setupRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/directory", directoryRouter);
  app.use("/api/gpo", gpoEditorRouter);
  app.use("/api/dns", dnsRouter);
  app.use("/api/sites", sitesRouter);
  app.use("/api/print-server", printServerRouter);
  app.use("/api/print", printRouter);
  app.use("/api/eventlog", eventLogRouter);
  app.use("/api/demote", demoteRouter);
  app.use("/api/backup", backupRouter);

  if (existsSync(config.frontendDistPath)) {
    app.use(express.static(config.frontendDistPath));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(config.frontendDistPath, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({ error: "internal-error", message });
  });

  return app;
}
