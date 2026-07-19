import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createServer } from "./server.js";
import { config } from "./config.js";
import { ensureTlsCertificate } from "./tls.js";
import { startSysvolSyncLoop } from "./setup/sysvolSync.service.js";
import { startPrintSyncLoop } from "./print/printSync.service.js";

async function main(): Promise<void> {
  const { certPath, keyPath } = await ensureTlsCertificate();
  const app = createServer();
  startSysvolSyncLoop();
  startPrintSyncLoop();

  https
    .createServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, app)
    .listen(config.httpsPort, () => {
      // eslint-disable-next-line no-console
      console.log(`samba-admin-webapp listening on https://0.0.0.0:${config.httpsPort}`);
    });

  http
    .createServer((req, res) => {
      const host = (req.headers.host ?? "").split(":")[0];
      res.writeHead(301, { Location: `https://${host}:${config.httpsPort}${req.url ?? ""}` });
      res.end();
    })
    .listen(config.httpPort, () => {
      // eslint-disable-next-line no-console
      console.log(`HTTP->HTTPS redirect listening on http://0.0.0.0:${config.httpPort}`);
    });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start samba-admin-webapp:", err);
  process.exit(1);
});
