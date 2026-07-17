import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, FolderPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const ACTION_LABELS: Record<FolderPreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

function FolderDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: FolderPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [action, setAction] = useState<FolderPreference["action"]>(item?.action ?? "U");
  const [folderPath, setFolderPath] = useState(item?.path ?? "");
  const [readOnly, setReadOnly] = useState(item?.readOnly ?? false);
  const [archive, setArchive] = useState(item?.archive ?? true);
  const [hidden, setHidden] = useState(item?.hidden ?? false);

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/folders/${scope}/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/folders/${scope}`, body),
    onSuccess: () => {
      pushToast("success", item ? "Ordner aktualisiert." : "Ordner erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = folderPath.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Ordner" : "Neue Eigenschaften für Ordner"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ action, scope, path: folderPath, readOnly, archive, hidden })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as FolderPreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Pfad:</WinLabel>
          <WinInput value={folderPath} onChange={(e) => setFolderPath(e.target.value)} autoFocus />
        </div>
        <WinCheckbox label="Schreibgeschützt" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
        <WinCheckbox label="Archiv" checked={archive} onChange={(e) => setArchive(e.target.checked)} />
        <WinCheckbox label="Ausgeblendet" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Windows-Einstellungen > Ordner list view. */
export function FoldersPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: FolderPreference }>();
  const [editing, setEditing] = useState<{ item?: FolderPreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-folders", gpo.guid, scope],
    queryFn: () => api.get<FolderPreference[]>(`/api/gpo/${gpo.guid}/folders/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-folders", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/folders/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Ordner gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: FolderPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Ordner...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Ordner "${menu.item!.path}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Ordner</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Ordner für {scope === "machine" ? "Computer" : "Benutzer"}.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um einen Ordner hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Pfad</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.path}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <FolderDialog
          gpo={gpo}
          scope={scope}
          item={editing.item}
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
