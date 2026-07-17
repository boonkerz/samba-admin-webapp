import type {
  CreateCupsPrinterRequest,
  CupsPrinterState,
  CupsPrinterSummary,
  DeviceUriOption,
  PpdModelOption,
  UpdateCupsPrinterRequest,
} from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";
import { getDriverIdForPrinter } from "./driver-upload.service.js";

const PRINTER_NAME_RE = /^[A-Za-z0-9_-]+$/;

function assertValidPrinterName(name: string): void {
  if (!PRINTER_NAME_RE.test(name)) {
    throw new Error("Der Druckername darf nur Buchstaben, Ziffern, Bindestrich und Unterstrich enthalten.");
  }
}

async function run(command: string, args: string[]): Promise<string> {
  const result = await runCapture(command, args);
  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || `${command} ist fehlgeschlagen.`);
  }
  return result.stdout;
}

/**
 * `lpstat -p -d -v` output looks like:
 *   printer test-printer-01 is idle.  enabled since ...
 *   printer test-printer-01 disabled since ...  reason unknown
 *   device for test-printer-01: socket://192.168.178.250:9100
 *   system default destination: test-printer-01
 */
export async function listPrinters(): Promise<CupsPrinterSummary[]> {
  const output = await runCapture("lpstat", ["-p", "-d", "-v"]);
  const lines = output.stdout.split("\n");

  const byName = new Map<string, CupsPrinterSummary>();
  let defaultName: string | undefined;

  function getOrCreate(name: string): CupsPrinterSummary {
    let entry = byName.get(name);
    if (!entry) {
      entry = { name, deviceUri: "", state: "stopped", accepting: false, shared: false, isDefault: false };
      byName.set(name, entry);
    }
    return entry;
  }

  for (const line of lines) {
    const printerMatch = line.match(/^printer (\S+) (is idle|is printing|disabled)/i);
    if (printerMatch) {
      const entry = getOrCreate(printerMatch[1]);
      const stateText = printerMatch[2].toLowerCase();
      const state: CupsPrinterState = stateText === "is idle" ? "idle" : stateText === "is printing" ? "printing" : "stopped";
      entry.state = state;
      entry.accepting = state !== "stopped";
      continue;
    }
    const deviceMatch = line.match(/^device for (\S+): (.+)$/);
    if (deviceMatch) {
      getOrCreate(deviceMatch[1]).deviceUri = deviceMatch[2].trim();
      continue;
    }
    const defaultMatch = line.match(/^system default destination: (\S+)/);
    if (defaultMatch) defaultName = defaultMatch[1];
  }

  const sharedOutput = await runCapture("lpstat", ["-a"]);
  const acceptingNames = new Set(sharedOutput.stdout.split("\n").map((l) => l.split(" ")[0]).filter(Boolean));

  const printers = [...byName.values()];
  for (const p of printers) {
    p.isDefault = p.name === defaultName;
    p.accepting = p.accepting && acceptingNames.has(p.name);
    p.driverId = await getDriverIdForPrinter(p.name);

    // `lpstat -p -d -v` has no notion of sharing/location/comment — `lpoptions -p <name>`
    // (run as root, server-side) does, as a space-separated key=value list.
    const optionsOutput = await runCapture("lpoptions", ["-p", p.name]);
    const options = parseLpOptions(optionsOutput.stdout);
    p.shared = options["printer-is-shared"] === "true";
    if (options["printer-location"]) p.location = options["printer-location"];
    if (options["printer-info"]) p.comment = options["printer-info"];
  }
  return printers;
}

function parseLpOptions(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /(\S+?)=('[^']*'|"[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    let value = m[2];
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    result[m[1]] = value;
  }
  return result;
}

export async function getPrinter(name: string): Promise<CupsPrinterSummary | undefined> {
  const printers = await listPrinters();
  return printers.find((p) => p.name === name);
}

export async function createPrinter(req: CreateCupsPrinterRequest): Promise<void> {
  assertValidPrinterName(req.name);
  const args = ["-p", req.name, "-v", req.deviceUri, "-m", "drv:///sample.drv/generic.ppd", "-E"];
  if (req.location) args.push("-L", req.location);
  if (req.comment) args.push("-D", req.comment);
  await run("lpadmin", args);
  if (req.shared) {
    await run("lpadmin", ["-p", req.name, "-o", "printer-is-shared=true"]);
  }
}

export async function updatePrinter(name: string, req: UpdateCupsPrinterRequest): Promise<void> {
  assertValidPrinterName(name);
  const args = ["-p", name];
  if (req.deviceUri) args.push("-v", req.deviceUri);
  if (req.location !== undefined) args.push("-L", req.location);
  if (req.comment !== undefined) args.push("-D", req.comment);
  if (req.shared !== undefined) args.push("-o", `printer-is-shared=${req.shared}`);
  if (args.length > 2) await run("lpadmin", args);
}

export async function deletePrinter(name: string): Promise<void> {
  assertValidPrinterName(name);
  await run("lpadmin", ["-x", name]);
}

export async function setDefaultPrinter(name: string): Promise<void> {
  assertValidPrinterName(name);
  await run("lpadmin", ["-d", name]);
}

export async function setPrinterEnabled(name: string, enabled: boolean): Promise<void> {
  assertValidPrinterName(name);
  if (enabled) {
    await run("cupsenable", [name]);
    await run("cupsaccept", [name]);
  } else {
    await run("cupsdisable", [name]);
    await run("cupsreject", [name]);
  }
}

/** `lpinfo -v` lines look like: "network socket://..." / "direct usb://...". */
export async function listDeviceUris(): Promise<DeviceUriOption[]> {
  const output = await runCapture("lpinfo", ["-v"]);
  const options: DeviceUriOption[] = [];
  for (const line of output.stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [scheme, uri] = parts;
    if (!uri.includes("://")) continue;
    options.push({ uri, scheme, description: `${scheme}: ${uri}` });
  }
  return options;
}

/** `lpinfo -m` lines look like: "<ppd-name> <description>". Filtered/capped server-side — the full list has thousands of entries. */
export async function listPpdModels(query?: string): Promise<PpdModelOption[]> {
  const output = await runCapture("lpinfo", ["-m"]);
  const needle = query?.toLowerCase().trim();
  const options: PpdModelOption[] = [];
  for (const line of output.stdout.split("\n")) {
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx === -1) continue;
    const ppdName = line.slice(0, spaceIdx).trim();
    const description = line.slice(spaceIdx + 1).trim();
    if (!ppdName) continue;
    if (needle && !description.toLowerCase().includes(needle) && !ppdName.toLowerCase().includes(needle)) continue;
    options.push({ ppdName, description });
    if (options.length >= 200) break;
  }
  return options;
}
