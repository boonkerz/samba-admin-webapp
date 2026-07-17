import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ProvisionState, SetupSummary } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";
import { config } from "../config.js";

interface ProvisionMarker extends SetupSummary {
  provisionedAt: string;
}

let cachedState: ProvisionState | undefined;

function readMarker(): ProvisionMarker | undefined {
  if (!existsSync(config.provisionMarkerPath)) return undefined;
  try {
    return JSON.parse(readFileSync(config.provisionMarkerPath, "utf8")) as ProvisionMarker;
  } catch {
    return undefined;
  }
}

async function isActuallyProvisioned(): Promise<boolean> {
  // On a genuinely bare box (the primary target scenario), samba isn't
  // installed yet at all, so these binaries won't exist (ENOENT) — that is
  // itself a clear "not provisioned" signal, not an error to propagate.
  try {
    const testparm = await runCapture("testparm", ["-s", "--parameter-name=server role"]);
    if (!/active directory domain controller/i.test(testparm.stdout)) return false;
    const domainInfo = await runCapture("samba-tool", ["domain", "info", "127.0.0.1"]);
    return domainInfo.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Determines whether this box is still bare or already an AD DC. Prefers the
 * app-owned marker file (fast path, written right after a successful
 * provision job); falls back to probing samba/testparm directly so a domain
 * provisioned before this app was installed is still detected correctly.
 */
export async function getProvisionState(): Promise<ProvisionState> {
  if (cachedState) return cachedState;
  if (readMarker()) {
    cachedState = "provisioned";
    return cachedState;
  }
  const provisioned = await isActuallyProvisioned();
  cachedState = provisioned ? "provisioned" : "unprovisioned";
  return cachedState;
}

export function invalidateProvisionStateCache(): void {
  cachedState = undefined;
}

export function writeProvisionMarker(summary: SetupSummary): void {
  mkdirSync(path.dirname(config.provisionMarkerPath), { recursive: true });
  const marker: ProvisionMarker = { ...summary, provisionedAt: new Date().toISOString() };
  writeFileSync(config.provisionMarkerPath, JSON.stringify(marker, null, 2));
  cachedState = "provisioned";
}

export function readProvisionSummary(): SetupSummary | undefined {
  return readMarker();
}
