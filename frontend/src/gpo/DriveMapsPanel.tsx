import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, DriveMapPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { DriveMapDialog } from "./DriveMapDialog";

const ACTION_LABELS: Record<DriveMapPreference["action"], string> = {
  C: "Erstellen",
  R: "Ersetzen",
  U: "Aktualisieren",
  D: "Löschen",
};

/** Mirrors real GPME's Benutzerkonfiguration > Einstellungen > Windows-Einstellungen > Laufwerkzuordnungen list view. */
export function DriveMapsPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: DriveMapPreference }>();
  const [editing, setEditing] = useState<{ item?: DriveMapPreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-drivemaps", gpo.guid],
    queryFn: () => api.get<DriveMapPreference[]>(`/api/gpo/${gpo.guid}/drivemaps`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-drivemaps", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/drivemaps/${uid}`),
    onSuccess: () => {
      pushToast("success", "Laufwerkzuordnung gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: DriveMapPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Zugeordnetes Laufwerk...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Laufwerkzuordnung "${menu.item!.path}" wirklich löschen?`)) {
                deleteMutation.mutate(menu.item!.uid);
              }
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
        <svg viewBox="0 0 16 16" className="h-6 w-6 text-slate-500" aria-hidden="true">
          <rect x="1" y="4" width="14" height="9" rx="1" fill="#E0E0E0" stroke="#9E9E9E" strokeWidth="0.5" />
          <rect x="1" y="4" width="14" height="3" fill="#78909C" />
          <circle cx="12.5" cy="10.5" r="1.5" fill="#4CAF50" />
        </svg>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Laufwerkzuordnungen</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Netzlaufwerke, die für Benutzer bereitgestellt werden.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um eine Laufwerkzuordnung hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Laufwerk</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Standort</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Bezeichnung</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Reihenfolge</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {item.useLetter && item.letter ? `${item.letter}:` : "Erster verfügbarer"}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.path}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.label}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.order + 1}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}

      {editing && (
        <DriveMapDialog
          gpo={gpo}
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
