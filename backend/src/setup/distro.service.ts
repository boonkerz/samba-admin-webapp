import { readFileSync } from "node:fs";

export interface DistroInfo {
  id: "debian" | "ubuntu";
  version: string;
  prettyName: string;
}

export class UnsupportedDistroError extends Error {
  constructor(id: string) {
    super(`Unsupported distribution "${id}". Only Debian and Ubuntu are supported.`);
    this.name = "UnsupportedDistroError";
  }
}

function parseOsRelease(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    result[key] = rawValue.replace(/^"(.*)"$/, "$1");
  }
  return result;
}

export function detectDistro(): DistroInfo {
  const contents = readFileSync("/etc/os-release", "utf8");
  const fields = parseOsRelease(contents);
  const id = fields.ID;
  if (id !== "debian" && id !== "ubuntu") {
    throw new UnsupportedDistroError(id ?? "unknown");
  }
  return {
    id,
    version: fields.VERSION_ID ?? "unknown",
    prettyName: fields.PRETTY_NAME ?? id,
  };
}

/**
 * Returns the apt package set for turning this distro into a Samba AD DC.
 *
 * `dnsutils` was a transitional package depending on `bind9-dnsutils`; Debian
 * 13 (trixie) has dropped it entirely, and modern Ubuntu releases dropped it
 * too, so `bind9-dnsutils` (the real package in both) is used unconditionally
 * rather than trying to guess a version cutoff per distro.
 */
export function requiredPackages(_distro: DistroInfo, dnsBackend: "SAMBA_INTERNAL" | "BIND9_DLZ"): string[] {
  const packages = [
    "samba-ad-dc",
    // Debian 13 (trixie) split the AD schema LDIF files (needed by
    // `samba-tool domain provision`) out of samba-ad-dc into their own
    // package; installing it unconditionally is harmless on releases where
    // samba-ad-dc still pulls it in as a dependency.
    "samba-ad-provision",
    "krb5-user",
    "krb5-config",
    "winbind",
    "libpam-winbind",
    "libnss-winbind",
    "smbclient",
    "bind9-dnsutils",
    "chrony",
    "acl",
    "attr",
  ];
  if (dnsBackend === "BIND9_DLZ") {
    packages.push("bind9", "bind9utils");
  }
  return packages;
}
