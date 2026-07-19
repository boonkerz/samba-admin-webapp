import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileShareSummary } from "@samba-admin/shared";
import { api } from "../api/client";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { useToastStore } from "../state/toastStore";
import { NewFileShareDialog } from "./NewFileShareDialog";
import { FileSharePropertiesDialog } from "./FileSharePropertiesDialog";

type MenuOpenEntry = { kind: "server" } | { kind: "share"; name: string };
type MenuState = MenuOpenEntry & { x: number; y: number };

/** Mirrors Windows' "Shared Folders" snap-in — general-purpose SMB file shares, distinct from the print server's queue shares. */
export function FileSharesLayout() {
  const { t } = useTranslation();
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("fileshares-layout-tree-width", 260, 200, 560);
  const [selectedShare, setSelectedShare] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showNewShare, setShowNewShare] = useState(false);
  const [editingShare, setEditingShare] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const sharesQuery = useQuery({
    queryKey: ["fileshares"],
    queryFn: () => api.get<FileShareSummary[]>("/api/fileshares"),
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete<{ jobId: string }>(`/api/fileshares/${encodeURIComponent(name)}`),
    onSuccess: () => {
      pushToast("success", t("fileShares.deleted", "Share deleted."));
      queryClient.invalidateQueries({ queryKey: ["fileshares"] });
      setSelectedShare(null);
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleContextMenu(e: MouseEvent, entry: MenuOpenEntry) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ ...entry, x: e.clientX, y: e.clientY });
  }

  const menuEntries: ContextMenuEntry[] | undefined = !menu
    ? undefined
    : menu.kind === "server"
      ? [{ label: t("fileShares.newShare", "New Share..."), onClick: () => setShowNewShare(true) }]
      : [
          { label: t("fileShares.properties", "Properties..."), onClick: () => setEditingShare(menu.name) },
          { separator: true },
          {
            label: t("fileShares.delete", "Delete"),
            danger: true,
            onClick: () => {
              if (confirm(t("fileShares.deleteConfirm", 'Delete share "{{name}}"? This does not delete the underlying folder or its files.', { name: menu.name }) as string)) {
                deleteMutation.mutate(menu.name);
              }
            },
          },
        ];

  const shares = sharesQuery.data ?? [];
  const selected = shares.find((s) => s.name === selectedShare);

  return (
    <div className="flex h-full">
      <aside style={{ width: treeWidth }} className="shrink-0 overflow-y-auto border-r border-slate-200 p-2 dark:border-slate-800">
        <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("nav.fileShares", "File Shares")}
        </h2>

        <TreeRow
          label={t("nav.fileShares", "File Shares")}
          iconType="server"
          onSelect={() => {}}
          onContextMenu={(e) => handleContextMenu(e, { kind: "server" })}
          depth={0}
        />

        {shares.map((s) => (
          <TreeRow
            key={s.name}
            label={s.name}
            iconType="share"
            onSelect={() => setSelectedShare(s.name)}
            onContextMenu={(e) => handleContextMenu(e, { kind: "share", name: s.name })}
            selected={selectedShare === s.name}
            depth={1}
          />
        ))}
      </aside>

      <ResizeHandle onMouseDown={onResizeMouseDown} />

      <main className="flex-1 overflow-auto p-4">
        {selected ? (
          <div className="max-w-2xl space-y-4">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">{selected.name}</h3>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">{t("fileShares.path", "Path")}</dt>
              <dd className="font-mono text-xs text-slate-700 dark:text-slate-300">{selected.path}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{t("fileShares.comment", "Description")}</dt>
              <dd className="text-slate-700 dark:text-slate-300">{selected.comment || "–"}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{t("fileShares.browseable", "Browseable")}</dt>
              <dd className="text-slate-700 dark:text-slate-300">{selected.browseable ? t("common.yes", "Yes") : t("common.no", "No")}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{t("fileShares.readOnly", "Read-only")}</dt>
              <dd className="text-slate-700 dark:text-slate-300">{selected.readOnly ? t("common.yes", "Yes") : t("common.no", "No")}</dd>
            </dl>
            <button
              className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600"
              onClick={() => setEditingShare(selected.name)}
            >
              {t("fileShares.properties", "Properties...")}
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <div className="text-center">
              <p className="text-lg font-medium text-slate-500 dark:text-slate-400">{t("nav.fileShares", "File Shares")}</p>
              <p className="mt-2">{t("fileShares.emptyState", "Select a share in the tree view.")}</p>
            </div>
          </div>
        )}
      </main>

      {menu && menuEntries && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} />}
      {showNewShare && <NewFileShareDialog onDone={() => setShowNewShare(false)} />}
      {editingShare &&
        (() => {
          const share = shares.find((s) => s.name === editingShare);
          if (!share) return null;
          return <FileSharePropertiesDialog share={share} onDone={() => setEditingShare(null)} />;
        })()}
    </div>
  );
}

function TreeRow({
  label,
  iconType,
  onSelect,
  onContextMenu,
  selected,
  depth,
}: {
  label: string;
  iconType: "server" | "share";
  onSelect: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  selected?: boolean;
  depth: number;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
        selected ? "bg-indigo-50 dark:bg-indigo-950" : ""
      }`}
      style={{ paddingLeft: depth * 14 + 4 }}
      onClick={onSelect}
      onContextMenu={onContextMenu}
    >
      <span className="w-4" />
      <FileSharesTreeIcon type={iconType} />
      <span className="truncate text-slate-700 dark:text-slate-300">{label}</span>
    </div>
  );
}

function FileSharesTreeIcon({ type }: { type: "server" | "share" }) {
  if (type === "server") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="2" width="14" height="9" rx="1" fill="#2563eb" />
        <rect x="2" y="3" width="12" height="7" fill="#93c5fd" />
        <rect x="6" y="12" width="4" height="1" fill="#1e40af" />
        <rect x="4" y="13" width="8" height="1" rx="0.5" fill="#1e40af" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z"
        fill="#fbbf24"
        stroke="#d97706"
        strokeWidth="0.4"
      />
      <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
      <circle cx="12" cy="11.5" r="3.2" fill="#38bdf8" stroke="#0369a1" strokeWidth="0.4" />
      <path d="M10.5 11.7l1 1 1.8-2" stroke="white" strokeWidth="0.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
