import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { FolderBrowseResult } from "@samba-admin/shared";

/**
 * Windows' "Browse For Folder" dialog equivalent, for picking a share's
 * underlying path without having to type it out (or SSH in to check it).
 * Lists only subdirectories — a share's path must be a directory, and files
 * would just be clutter here. No sandboxing to a particular subtree: this
 * app already runs as root and is only reachable by a domain administrator,
 * same trust boundary as picking a path in Windows' own dialog.
 */
export function browseFolder(requestedPath: string): FolderBrowseResult {
  const normalized = path.resolve(requestedPath || "/");
  const stat = statSync(normalized);
  if (!stat.isDirectory()) {
    throw new Error(`"${normalized}" is not a directory.`);
  }

  const entries: string[] = [];
  for (const dirent of readdirSync(normalized, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    entries.push(dirent.name);
  }
  entries.sort((a, b) => a.localeCompare(b));

  const parent = path.dirname(normalized);
  return { path: normalized, parentPath: parent === normalized ? null : parent, entries };
}

export function createFolder(parentPath: string, name: string): string {
  if (!name || /[/\\]/.test(name)) {
    throw new Error("Folder name must not contain a path separator.");
  }
  const target = path.join(path.resolve(parentPath), name);
  mkdirSync(target, { recursive: false });
  return target;
}
