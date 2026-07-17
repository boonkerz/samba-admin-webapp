import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children?: ContextMenuItem[];
}

export type ContextMenuEntry = ContextMenuItem | { separator: true };

function isSeparator(entry: ContextMenuEntry): entry is { separator: true } {
  return "separator" in entry;
}

function itemClass(danger?: boolean): string {
  return `flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
    danger
      ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
  }`;
}

export function ContextMenu({ x, y, entries, onClose }: { x: number; y: number; entries: ContextMenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<number | null>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const adjX = x + rect.width > window.innerWidth ? Math.max(8, window.innerWidth - rect.width - 8) : x;
    const adjY = y + rect.height > window.innerHeight ? Math.max(8, window.innerHeight - rect.height - 8) : y;
    setPos({ x: adjX, y: adjY });
  }, [x, y]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-48 rounded-md bg-white py-1 text-sm shadow-lg ring-1 ring-black/10 dark:bg-slate-800 dark:ring-white/10"
      style={{ left: pos.x, top: pos.y }}
    >
      {entries.map((entry, i) =>
        isSeparator(entry) ? (
          <div key={i} className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
        ) : (
          <div key={i} className="relative" onMouseEnter={() => setSubmenu(entry.children ? i : null)}>
            <button
              type="button"
              disabled={entry.disabled}
              onClick={() => {
                if (entry.children) return;
                entry.onClick?.();
                onClose();
              }}
              className={itemClass(entry.danger)}
            >
              <span>{entry.label}</span>
              {entry.children && <span className="text-slate-400">▸</span>}
            </button>
            {entry.children && submenu === i && (
              <div className="absolute left-full top-0 min-w-44 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/10 dark:bg-slate-800 dark:ring-white/10">
                {entry.children.map((child, j) => (
                  <button
                    key={j}
                    type="button"
                    disabled={child.disabled}
                    onClick={() => {
                      child.onClick?.();
                      onClose();
                    }}
                    className={itemClass(child.danger)}
                  >
                    <span>{child.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
