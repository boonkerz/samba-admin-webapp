import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, ScheduledTaskPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { ScheduledTaskDialog } from "./ScheduledTaskDialog";

const ACTION_LABELS: Record<ScheduledTaskPreference["action"], string> = {
  C: "Erstellen",
  R: "Ersetzen",
  U: "Aktualisieren",
  D: "Löschen",
};

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Geplante Aufgaben list view, for either config side. */
export function ScheduledTasksPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: ScheduledTaskPreference }>();
  const [editing, setEditing] = useState<{ item?: ScheduledTaskPreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-scheduledtasks", gpo.guid, scope],
    queryFn: () => api.get<ScheduledTaskPreference[]>(`/api/gpo/${gpo.guid}/scheduledtasks/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-scheduledtasks", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/scheduledtasks/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Geplante Aufgabe gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: ScheduledTaskPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Aufgabe (mind. Windows 7)...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Aufgabe "${menu.item!.name}" wirklich löschen?`)) {
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
          <rect x="2" y="2" width="12" height="12" rx="1" fill="#F5F5F5" stroke="#9E9E9E" strokeWidth="0.5" />
          <circle cx="8" cy="8" r="4" fill="none" stroke="#78909C" strokeWidth="1" />
          <path d="M8 5.5V8l1.8 1.2" stroke="#78909C" strokeWidth="1" fill="none" strokeLinecap="round" />
        </svg>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Geplante Aufgaben</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aufgaben, die für {scope === "machine" ? "Computer" : "Benutzer"} bereitgestellt werden.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um eine geplante Aufgabe hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Trigger</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktionen</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion (GPO)</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.name}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.immediate ? "Sofortige Aufgabe" : "Geplante Aufgabe"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.immediate ? "—" : item.triggers.length}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.actions.length}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}

      {editing && (
        <ScheduledTaskDialog
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
