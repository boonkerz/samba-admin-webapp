import { runCapture } from "../exec/safeExec.js";

export interface NetCredentials {
  username: string;
  password: string;
}

/**
 * Runs a raw MS-RPRN spoolss command via `rpcclient` against the local RPC
 * endpoint. `net rpc printer driver add`/`setdriver` — the classically
 * documented way to do this — turned out NOT to work against this Samba
 * version's embedded AD-DC spoolss service (confirmed live: `net rpc printer
 * driver` silently ignores any extra arguments and just re-lists drivers).
 * `rpcclient`'s `adddriver`/`setdriver`/`getdriverdir` commands are the raw
 * AddPrinterDriver()/SetPrinter()/GetPrinterDriverDirectory() RPCs and do
 * work — confirmed live end-to-end (adddriver + setdriver + getprinter
 * showing the association).
 */
export async function runRpcClientCommand(creds: NetCredentials, command: string): Promise<string> {
  const result = await runCapture("rpcclient", ["-c", command, "-U", creds.username, "127.0.0.1"], {
    env: { ...process.env, PASSWD: creds.password },
  });
  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || "rpcclient ist fehlgeschlagen.");
  }
  return result.stdout;
}
