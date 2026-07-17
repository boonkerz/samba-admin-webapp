import { readFileSync, writeFileSync } from "node:fs";
import { runCapture } from "../exec/safeExec.js";

const SMB_CONF_PATH = "/etc/samba/smb.conf";
const FORWARDER_LINE_RE = /^[ \t]*dns forwarder[ \t]*=.*$/im;

/** Reads the live "dns forwarder" value from smb.conf via testparm (normalizes/validates, doesn't just regex the raw file). */
export async function getForwarders(): Promise<string[]> {
  const result = await runCapture("testparm", ["-s", "--parameter-name=dns forwarder", SMB_CONF_PATH]);
  if (result.exitCode !== 0) throw new Error(result.stderr || "testparm ist fehlgeschlagen.");
  const value = result.stdout.trim();
  return value ? value.split(/\s+/) : [];
}

/**
 * Writes the "dns forwarder" line into smb.conf's [global] section. Samba's internal DNS server only
 * reads this at startup, so the caller must separately trigger restartDnsService() for it to take effect.
 */
export function setForwarders(ips: string[]): void {
  const content = readFileSync(SMB_CONF_PATH, "utf8");
  let next: string;
  if (ips.length === 0) {
    next = FORWARDER_LINE_RE.test(content) ? content.replace(new RegExp(`${FORWARDER_LINE_RE.source}\\n?`, "im"), "") : content;
  } else {
    const newLine = `\tdns forwarder = ${ips.join(" ")}`;
    next = FORWARDER_LINE_RE.test(content)
      ? content.replace(FORWARDER_LINE_RE, newLine)
      : content.replace(/^\[global\][ \t]*$/im, (m) => `${m}\n${newLine}`);
  }
  writeFileSync(SMB_CONF_PATH, next, "utf8");
}

/** Restarts the Samba AD DC service so a forwarder change takes effect — briefly interrupts all AD/LDAP/DNS connectivity. */
export async function restartDnsService(): Promise<void> {
  const result = await runCapture("systemctl", ["restart", "samba-ad-dc"]);
  if (result.exitCode !== 0) throw new Error(result.stderr || "Neustart des Samba-Dienstes ist fehlgeschlagen.");
}
