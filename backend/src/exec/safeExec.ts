import { spawn } from "node:child_process";

/**
 * Sole choke point for privileged command execution in this app.
 *
 * Every caller passes `args` as a plain string array — never a shell string.
 * `spawn` is invoked with `shell: false` (the default) so no shell ever parses
 * the arguments, meaning shell metacharacters in user-supplied values (realm
 * names, passwords, OU names, ...) cannot break out of their argv slot.
 *
 * Only commands in ALLOWED_COMMANDS may be run: the frontend can never reach
 * an arbitrary binary or shell command, only the specific operations this
 * backend implements against a fixed, server-controlled command set.
 */
const ALLOWED_COMMANDS = new Set([
  "apt-get",
  "debconf-set-selections",
  "systemctl",
  "samba-tool",
  "testparm",
  "ss",
  "hostnamectl",
  "chronyc",
  "df",
  "uptime",
  "hostname",
  "ufw",
  "nft",
  "cp",
  "ldbsearch",
  "openssl",
  "python3",
  "cupsctl",
  "lpadmin",
  "lpstat",
  "lpinfo",
  "lpoptions",
  "cupsenable",
  "cupsdisable",
  "cupsaccept",
  "cupsreject",
  // Raw MS-RPRN (spoolss) RPC client — used for print driver store
  // operations. `net rpc printer driver add`/`setdriver` (the classically
  // documented way to do this) turned out not to work against this Samba
  // version's embedded AD-DC spoolss service; rpcclient's adddriver/
  // setdriver/getdriverdir commands are the raw RPCs and do work, verified live.
  "rpcclient",
  "smbclient",
  "smbcontrol",
  "systemd-detect-virt",
  // NetBIOS name resolution (broadcast/WINS) — many real network printers
  // are only resolvable this way, not via DNS at all (confirmed live).
  "nmblookup",
  // Extracting uploaded third-party ADMX template bundles (Chrome, Adobe, ...).
  "unzip",
  // Event Viewer — reads systemd service logs (samba-ad-dc, smbd, cups, ...).
  "journalctl",
  // SYSVOL replication between DCs — extracting the tar snapshot smbclient
  // pulls from the PDC emulator. Part of the base OS, no new install needed.
  "tar",
]);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class DisallowedCommandError extends Error {
  constructor(command: string) {
    super(`Command "${command}" is not in the allowlist and cannot be executed.`);
    this.name = "DisallowedCommandError";
  }
}

function assertAllowed(command: string): void {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new DisallowedCommandError(command);
  }
}

/** Runs a short-lived command to completion and captures its output. */
export function runCapture(
  command: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number } = {}
): Promise<ExecResult> {
  assertAllowed(command);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: opts.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));

    const timer = opts.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
      : undefined;

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: exitCode ?? -1 });
    });

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}

export interface StreamingHandle {
  onLine(cb: (stream: "stdout" | "stderr", line: string) => void): void;
  onExit(cb: (exitCode: number) => void): void;
  kill(): void;
}

/**
 * Runs a long-lived command, invoking `onLine` for every complete line of
 * stdout/stderr as it arrives (for SSE streaming to the browser via jobRunner).
 */
export function spawnStreaming(command: string, args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): StreamingHandle {
  assertAllowed(command);
  const child = spawn(command, args, {
    shell: false,
    env: opts.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lineCallbacks: Array<(stream: "stdout" | "stderr", line: string) => void> = [];
  const exitCallbacks: Array<(exitCode: number) => void> = [];

  function pump(stream: "stdout" | "stderr", readable: NodeJS.ReadableStream) {
    let buffer = "";
    readable.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        for (const cb of lineCallbacks) cb(stream, line);
      }
    });
    readable.on("end", () => {
      if (buffer.length > 0) {
        for (const cb of lineCallbacks) cb(stream, buffer);
        buffer = "";
      }
    });
  }

  pump("stdout", child.stdout);
  pump("stderr", child.stderr);

  child.on("close", (exitCode) => {
    for (const cb of exitCallbacks) cb(exitCode ?? -1);
  });

  return {
    onLine: (cb) => lineCallbacks.push(cb),
    onExit: (cb) => exitCallbacks.push(cb),
    kill: () => child.kill("SIGTERM"),
  };
}
