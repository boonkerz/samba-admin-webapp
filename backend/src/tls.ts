import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runCapture } from "./exec/safeExec.js";
import { config } from "./config.js";

/**
 * Generates a self-signed certificate on first boot if none exists yet, so
 * the appliance is reachable over HTTPS from the very first page load
 * (domain admin credentials must never transit plaintext). The browser will
 * show a self-signed warning on first visit — expected, same UX as
 * Cockpit/Proxmox/iDRAC for a LAN appliance.
 */
export async function ensureTlsCertificate(): Promise<{ certPath: string; keyPath: string }> {
  if (existsSync(config.tlsCertPath) && existsSync(config.tlsKeyPath)) {
    return { certPath: config.tlsCertPath, keyPath: config.tlsKeyPath };
  }

  mkdirSync(path.dirname(config.tlsCertPath), { recursive: true });
  const cn = os.hostname();
  const result = await runCapture("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    config.tlsKeyPath,
    "-out",
    config.tlsCertPath,
    "-days",
    "3650",
    "-subj",
    `/CN=${cn}`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to generate self-signed TLS certificate: ${result.stderr}`);
  }
  return { certPath: config.tlsCertPath, keyPath: config.tlsKeyPath };
}
