/**
 * General-purpose SMB file shares — the "Shared Folders" MMC snap-in
 * equivalent. Distinct from print.ts's CUPS printer shares: this is about
 * exposing an arbitrary filesystem path for file serving.
 */
export interface FileShareSummary {
  name: string;
  path: string;
  comment?: string;
  browseable: boolean;
  readOnly: boolean;
}

export interface CreateFileShareRequest {
  name: string;
  path: string;
  comment?: string;
  browseable?: boolean;
  readOnly?: boolean;
}

export type UpdateFileShareRequest = Partial<Omit<CreateFileShareRequest, "name">>;

export interface FileShareValidationResult {
  valid: boolean;
  errors: { name?: string; path?: string };
}

/**
 * Share-level permissions (Windows' "Share Permissions" tab) — access control
 * on the share itself, checked in addition to (and independently of) the
 * filesystem permissions below. Backed by `sharesec`; mask is one of
 * `sharesec`'s own named combined-permission strings (READ = RX, CHANGE =
 * RXWD, FULL = RWXDPO — see `man sharesec`), not a bitmask this app invents.
 */
export type ShareAccessMask = "FULL" | "CHANGE" | "READ";

export interface ShareAce {
  /** SID (S-1-...) or a name resolvable on this server (e.g. "BSW\\Domain Admins", "Everyone"). */
  trustee: string;
  type: "ALLOWED" | "DENIED";
  mask: ShareAccessMask;
}

/**
 * Filesystem ("NTFS-style") permissions on the share's underlying path,
 * backed by POSIX ACLs (`getfacl`/`setfacl`) — Samba maps these to the
 * Windows security descriptor clients see. Deliberately only exposes 4
 * levels that map cleanly to POSIX rwx triples; there is no POSIX equivalent
 * of NTFS's finer-grained special permissions (e.g. delete-subfolders-only),
 * so this doesn't pretend to offer them.
 */
export type FsAccessLevel = "FULL_CONTROL" | "READ_EXECUTE" | "READ" | "WRITE";

export type FsAclEntryKind = "owner" | "group" | "other" | "user" | "group-named";

export interface FsAclEntry {
  kind: FsAclEntryKind;
  /** Account/group name for "user"/"group-named"; the actual owner/group account for "owner"/"group"; unused for "other". */
  trustee: string;
  level: FsAccessLevel;
}

export interface FsAclInfo {
  path: string;
  isDirectory: boolean;
  entries: FsAclEntry[];
}

/** Windows' "Browse For Folder" dialog equivalent — lists only subdirectories (a share's path must be a directory), never files. */
export interface FolderBrowseResult {
  path: string;
  parentPath: string | null;
  entries: string[];
}

export interface CreateFolderRequest {
  parentPath: string;
  name: string;
}
