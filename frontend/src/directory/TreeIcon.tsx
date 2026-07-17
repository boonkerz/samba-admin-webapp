import type { DirectoryObjectType } from "@samba-admin/shared";

/**
 * Small flat icons mirroring ADUC's tree: OUs get a yellow folder with a
 * little "index card" badge, plain containers (Builtin, top-level Users,
 * Computers, ForeignSecurityPrincipals, ...) get the same folder without the
 * badge, and the domain root gets its own distinct (blue) icon.
 */
export function TreeIcon({ type, className = "h-4 w-4" }: { type: DirectoryObjectType; className?: string }) {
  switch (type) {
    case "domain":
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="8" rx="0.8" fill="#2f76c9" />
          <rect x="2.6" y="3.6" width="10.8" height="5.8" fill="#cfe6ff" />
          <rect x="6.5" y="10.7" width="3" height="1.3" fill="#2f76c9" />
          <rect x="4.5" y="12.1" width="7" height="1.1" rx="0.5" fill="#2f76c9" />
        </svg>
      );
    case "ou":
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <path d="M1.5 4.2c0-.55.45-1 1-1h3.3l1.2 1.3h6.5c.55 0 1 .45 1 1v6.3c0 .55-.45 1-1 1h-11c-.55 0-1-.45-1-1z" fill="#f4bb3c" stroke="#c9910f" strokeWidth="0.4" />
          <rect x="8.6" y="7.6" width="6" height="4.9" rx="0.4" fill="#eef4fb" stroke="#5b7a9d" strokeWidth="0.55" />
          <line x1="9.4" y1="9" x2="13.8" y2="9" stroke="#5b7a9d" strokeWidth="0.6" />
          <line x1="9.4" y1="10.4" x2="13.8" y2="10.4" stroke="#5b7a9d" strokeWidth="0.6" />
          <line x1="9.4" y1="11.6" x2="12" y2="11.6" stroke="#5b7a9d" strokeWidth="0.6" />
        </svg>
      );
    case "container":
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <path d="M1.5 4.2c0-.55.45-1 1-1h3.3l1.2 1.3h6.5c.55 0 1 .45 1 1v6.3c0 .55-.45 1-1 1h-11c-.55 0-1-.45-1-1z" fill="#f4bb3c" stroke="#c9910f" strokeWidth="0.4" />
        </svg>
      );
    case "user":
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <circle cx="8" cy="5.3" r="2.6" fill="#6b7280" />
          <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="#6b7280" />
        </svg>
      );
    case "group":
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <circle cx="5.5" cy="5.3" r="2.2" fill="#6b7280" />
          <circle cx="10.5" cy="5.3" r="2.2" fill="#9ca3af" />
          <path d="M1 14c0-2.6 2-4.6 4.5-4.6S10 11.4 10 14" fill="#6b7280" />
          <path d="M7 14c0-2.2 1.6-4 4-4s4 1.8 4 4" fill="#9ca3af" />
        </svg>
      );
    case "computer":
      return (
        <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="8" rx="0.6" fill="#374151" />
          <rect x="2.5" y="3.5" width="11" height="6" fill="#93c5fd" />
          <rect x="6" y="11" width="4" height="1.4" fill="#374151" />
          <rect x="4" y="12.6" width="8" height="1" rx="0.5" fill="#374151" />
        </svg>
      );
    default:
      return null;
  }
}
