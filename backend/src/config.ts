import path from "node:path";

const dataDir = process.env.SAMBA_ADMIN_DATA_DIR ?? "/var/lib/samba-admin-webapp";
const logDir = process.env.SAMBA_ADMIN_LOG_DIR ?? "/var/log/samba-admin-webapp";
const configDir = process.env.SAMBA_ADMIN_CONFIG_DIR ?? "/etc/samba-admin-webapp";

export const config = {
  httpPort: Number(process.env.SAMBA_ADMIN_HTTP_PORT ?? 8080),
  httpsPort: Number(process.env.SAMBA_ADMIN_HTTPS_PORT ?? 8443),
  dataDir,
  logDir,
  configDir,
  provisionMarkerPath: path.join(dataDir, "provisioned.json"),
  secretKeyPath: path.join(configDir, "secret.key"),
  tlsCertPath: path.join(configDir, "tls", "cert.pem"),
  tlsKeyPath: path.join(configDir, "tls", "key.pem"),
  jobLogDir: path.join(logDir, "jobs"),
  auditLogPath: path.join(logDir, "audit.log"),
  frontendDistPath: process.env.SAMBA_ADMIN_FRONTEND_DIST ?? path.resolve(import.meta.dirname, "../../frontend/dist"),
  scriptsDir: process.env.SAMBA_ADMIN_SCRIPTS_DIR ?? path.resolve(import.meta.dirname, "../scripts"),
  ldapsUrl: process.env.SAMBA_ADMIN_LDAPS_URL ?? "ldaps://127.0.0.1:636",
  sessionTtlMs: 45 * 60 * 1000,
  // Secure cookies require HTTPS. Only disable for local dev/testing without TLS.
  cookieSecure: process.env.SAMBA_ADMIN_INSECURE_COOKIES !== "1",
};
