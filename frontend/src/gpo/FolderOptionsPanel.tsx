import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, FolderOptionsPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { GlobalFolderOptionsXpDialog, GlobalFolderOptionsVistaDialog, OpenWithDialog, FileTypeDialog } from "./FolderOptionsDialogs";

const ACTION_LABELS: Record<FolderOptionsPreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

const KIND_LABELS: Record<FolderOptionsPreference["kind"], string> = {
  globalXp: "Ordneroptionen (Windows XP)",
  globalVista: "Ordneroptionen (Windows Vista)",
  openWith: "Öffnen mit",
  fileType: "Dateizuordnung",
};

function displayName(item: FolderOptionsPreference): string {
  if (item.kind === "globalXp") return "Ordneroptionen (Windows XP)";
  if (item.kind === "globalVista") return "Ordneroptionen (Windows Vista)";
  if (item.kind === "openWith") return item.fileExtension;
  return item.fileExt;
}

type EditingState = { kind: FolderOptionsPreference["kind"]; item?: FolderOptionsPreference } | null;

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Ordneroptionen list view. */
export function FolderOptionsPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: FolderOptionsPreference }>();
  const [editing, setEditing] = useState<EditingState>(null);

  const query = useQuery({
    queryKey: ["gpp-folderoptions", gpo.guid],
    queryFn: () => api.get<FolderOptionsPreference[]>(`/api/gpo/${gpo.guid}/folderoptions`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-folderoptions", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/folderoptions/${uid}`),
    onSuccess: () => {
      pushToast("success", "Ordneroption gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: FolderOptionsPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    {
      label: "Neu",
      children: [
        { label: "Ordneroptionen (Windows XP)...", onClick: () => setEditing({ kind: "globalXp" }) },
        { label: "Ordneroptionen (mind. Windows Vista)...", onClick: () => setEditing({ kind: "globalVista" }) },
        { label: "Öffnen mit...", onClick: () => setEditing({ kind: "openWith" }) },
        { label: "Dateizuordnung...", onClick: () => setEditing({ kind: "fileType" }) },
      ],
    },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ kind: menu.item!.kind, item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`"${displayName(menu.item!)}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Ordneroptionen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Ordneroptionen, die für Benutzer bereitgestellt werden.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um eine Ordneroption hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ kind: item.kind, item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{displayName(item)}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{KIND_LABELS[item.kind]}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing?.kind === "globalXp" && (
        <GlobalFolderOptionsXpDialog
          gpo={gpo}
          item={editing.item as Extract<FolderOptionsPreference, { kind: "globalXp" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "globalVista" && (
        <GlobalFolderOptionsVistaDialog
          gpo={gpo}
          item={editing.item as Extract<FolderOptionsPreference, { kind: "globalVista" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "openWith" && (
        <OpenWithDialog
          gpo={gpo}
          item={editing.item as Extract<FolderOptionsPreference, { kind: "openWith" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "fileType" && (
        <FileTypeDialog
          gpo={gpo}
          item={editing.item as Extract<FolderOptionsPreference, { kind: "fileType" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
