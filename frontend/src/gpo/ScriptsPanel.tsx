import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, GpoScript, ScriptEvent } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";

const ScriptEditorDialog = lazy(() => import("./ScriptEditorDialog").then((m) => ({ default: m.ScriptEditorDialog })));

const TABS_BY_SCOPE: Record<"machine" | "user", { event: ScriptEvent; label: string }[]> = {
  machine: [
    { event: "startup", label: "Start" },
    { event: "shutdown", label: "Herunterfahren" },
  ],
  user: [
    { event: "logon", label: "Anmelden" },
    { event: "logoff", label: "Abmelden" },
  ],
};

/** Mirrors real GPME's Richtlinien > Windows-Einstellungen > Skripte properties dialog (Startup/Shutdown or Logon/Logoff tabs), rendered inline like this app's other policy panels rather than as a popup. */
export function ScriptsPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const tabs = TABS_BY_SCOPE[scope];
  const [activeEvent, setActiveEvent] = useState<ScriptEvent>(tabs[0].event);
  const [editing, setEditing] = useState<{ item?: GpoScript } | null>(null);

  const query = useQuery({
    queryKey: ["gpo-scripts", gpo.guid, scope],
    queryFn: () => api.get<GpoScript[]>(`/api/gpo/${gpo.guid}/scripts/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpo-scripts", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/scripts/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Skript gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = (query.data ?? []).filter((i) => i.event === activeEvent).sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
        <svg viewBox="0 0 16 16" className="h-6 w-6" aria-hidden="true">
          <rect x="1" y="2" width="14" height="12" rx="1.5" fill="#263238" />
          <path d="M4 7l2 2-2 2" stroke="#4CAF50" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="7" y1="11" x2="11" y2="11" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Skripte</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Skripte, die {scope === "machine" ? "beim Starten/Herunterfahren des Computers" : "bei An-/Abmeldung des Benutzers"} ausgeführt
            werden.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab) => (
          <button
            key={tab.event}
            type="button"
            onClick={() => setActiveEvent(tab.event)}
            className={`rounded-t-sm border border-b-0 px-3 py-1.5 text-sm ${
              activeEvent === tab.event
                ? "border-slate-300 bg-white font-medium text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
            style={activeEvent === tab.event ? { marginBottom: -1 } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto py-3">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">Keine Skripte konfiguriert.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Parameter</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ item })}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{item.fileName}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.parameters}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.kind === "powershell" ? "PowerShell" : "Skript"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Skript "${item.fileName}" wirklich entfernen?`)) deleteMutation.mutate(item.uid);
                      }}
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setEditing({})}
          className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          Hinzufügen...
        </button>
      </div>

      {editing && (
        <Suspense fallback={null}>
          <ScriptEditorDialog
            gpo={gpo}
            scope={scope}
            event={activeEvent}
            item={editing.item}
            onClose={() => setEditing(null)}
            onSaved={() => {
              invalidate();
              setEditing(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
