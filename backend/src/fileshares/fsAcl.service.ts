import { statSync } from "node:fs";
import type { FsAccessLevel, FsAclEntry, FsAclInfo } from "@samba-admin/shared";
import { runCapture } from "../exec/safeExec.js";

/**
 * Filesystem ("NTFS-style") permissions on a share's underlying path, backed
 * by POSIX ACLs (`getfacl`/`setfacl`) — verified live against a real DC.
 * `getfacl` text-escapes any byte outside a safe set as `\NNN` (octal) and
 * escapes a literal backslash as `\\`; `unescapeAclText` reverses that.
 *
 * Deliberately doesn't surface the POSIX ACL `mask::` entry (it's an
 * effective-rights cap, not a real grant — Windows' own security tab
 * doesn't show anything like it either) or `default:` entries separately:
 * this app always keeps the access and default ACL identical on a directory
 * (see `setFsAcl`), so there's nothing distinct to show for defaults.
 */

function unescapeAclText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\\") {
      out += text[i];
      continue;
    }
    if (text[i + 1] === "\\") {
      out += "\\";
      i += 1;
      continue;
    }
    const octal = text.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      out += String.fromCharCode(parseInt(octal, 8));
      i += 3;
    } else {
      out += text[i];
    }
  }
  return out;
}

function levelToRwx(level: FsAccessLevel): string {
  switch (level) {
    case "FULL_CONTROL":
      return "rwx";
    case "READ_EXECUTE":
      return "r-x";
    case "READ":
      return "r--";
    case "WRITE":
      return "-wx";
    default:
      throw new Error(`Unknown access level: ${level}`);
  }
}

function rwxToLevel(rwx: string): FsAccessLevel {
  const r = rwx.includes("r");
  const w = rwx.includes("w");
  const x = rwx.includes("x");
  if (w) return r || x ? "FULL_CONTROL" : "WRITE";
  if (r && x) return "READ_EXECUTE";
  return "READ";
}

export async function getFsAcl(path: string): Promise<FsAclInfo> {
  const result = await runCapture("getfacl", ["-p", path]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read filesystem permissions for "${path}": ${result.stderr || result.stdout}`);
  }

  let owner = "";
  let group = "";
  const entries: FsAclEntry[] = [];

  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("# owner:")) owner = unescapeAclText(line.slice("# owner:".length).trim());
    else if (line.startsWith("# group:")) group = unescapeAclText(line.slice("# group:".length).trim());
    if (line.startsWith("#") || line === "" || line.startsWith("default:")) continue;

    const match = /^(user|group|other|mask)(:([^:]*))?:([r-][w-][x-])$/.exec(line);
    if (!match) continue;
    const [, kind, , rawName, rwx] = match;
    if (kind === "mask") continue;
    if (kind === "user") {
      entries.push(rawName ? { kind: "user", trustee: unescapeAclText(rawName), level: rwxToLevel(rwx) } : { kind: "owner", trustee: owner, level: rwxToLevel(rwx) });
    } else if (kind === "group") {
      entries.push(
        rawName ? { kind: "group-named", trustee: unescapeAclText(rawName), level: rwxToLevel(rwx) } : { kind: "group", trustee: group, level: rwxToLevel(rwx) }
      );
    } else if (kind === "other") {
      entries.push({ kind: "other", trustee: "", level: rwxToLevel(rwx) });
    }
  }

  return { path, isDirectory: statSync(path).isDirectory(), entries };
}

export async function setFsAcl(path: string, entries: FsAclEntry[]): Promise<void> {
  const hasBase = (kind: "owner" | "group" | "other") => entries.some((e) => e.kind === kind);
  if (!hasBase("owner") || !hasBase("group") || !hasBase("other")) {
    throw new Error("Owner, group, and other permissions are all required.");
  }

  const isDirectory = statSync(path).isDirectory();

  // Strip all extended entries (named users/groups, mask, and any default
  // ACL) back to bare owner/group/other first, so removed entries actually
  // disappear rather than lingering from a previous save.
  const reset = await runCapture("setfacl", ["-b", path]);
  if (reset.exitCode !== 0) {
    throw new Error(`Failed to reset permissions for "${path}": ${reset.stderr || reset.stdout}`);
  }

  const specs = entries.map((e) => {
    const rwx = levelToRwx(e.level);
    switch (e.kind) {
      case "owner":
        return `u::${rwx}`;
      case "group":
        return `g::${rwx}`;
      case "other":
        return `o::${rwx}`;
      case "user":
        return `u:${e.trustee}:${rwx}`;
      case "group-named":
        return `g:${e.trustee}:${rwx}`;
    }
  });

  // Directories get identical default-ACL entries so new files/subfolders
  // inherit the same permissions — matching how Windows' "apply to this
  // folder, subfolders and files" inheritance normally works.
  const allSpecs = isDirectory ? [...specs, ...specs.map((s) => `d:${s}`)] : specs;

  const apply = await runCapture("setfacl", ["-m", allSpecs.join(","), path]);
  if (apply.exitCode !== 0) {
    throw new Error(`Failed to set permissions for "${path}": ${apply.stderr || apply.stdout}`);
  }
}
