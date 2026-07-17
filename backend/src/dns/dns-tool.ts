import { runCapture } from "../exec/safeExec.js";

export interface DnsCredentials {
  username: string;
  password: string;
}

/** The DNS RPC server we always target: Samba's own DNS server on this DC. */
export const DNS_SERVER = "127.0.0.1";

const WERR_MESSAGES: Record<string, string> = {
  WERR_DNS_ERROR_ZONE_DOES_NOT_EXIST: "Die Zone wurde nicht gefunden.",
  WERR_DNS_ERROR_ZONE_ALREADY_EXISTS: "Eine Zone mit diesem Namen existiert bereits.",
  WERR_DNS_ERROR_DNS_RECORD_ALREADY_EXISTS: "Ein identischer Eintrag existiert bereits.",
  WERR_DNS_ERROR_RECORD_DOES_NOT_EXIST: "Der Eintrag wurde nicht gefunden.",
  WERR_DNS_ERROR_NAME_DOES_NOT_EXIST: "Der Name wurde in dieser Zone nicht gefunden.",
  WERR_ACCESS_DENIED: "Keine Berechtigung für diesen DNS-Vorgang.",
};

function toReadableError(stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`;
  for (const [code, message] of Object.entries(WERR_MESSAGES)) {
    if (combined.includes(code)) return message;
  }
  return (stderr || stdout).trim() || "samba-tool dns ist fehlgeschlagen.";
}

/** Runs `samba-tool dns <args>` against the local DNS RPC server using the caller's own domain credentials. */
export async function runDnsTool(creds: DnsCredentials, args: string[]): Promise<string> {
  const result = await runCapture("samba-tool", ["dns", ...args, "-U", creds.username], {
    env: { ...process.env, PASSWD: creds.password },
  });
  if (result.exitCode !== 0) {
    throw new Error(toReadableError(result.stderr, result.stdout));
  }
  return result.stdout;
}
