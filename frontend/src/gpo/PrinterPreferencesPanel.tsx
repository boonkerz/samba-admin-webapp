import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, PrinterPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { SharedPrinterDialog, LocalPrinterDialog, TcpIpPrinterDialog } from "./PrinterConnectionDialogs";

const ACTION_LABELS: Record<PrinterPreference["action"], string> = {
  C: "Erstellen",
  R: "Ersetzen",
  U: "Aktualisieren",
  D: "Löschen",
};

function displayName(item: PrinterPreference): string {
  if (item.connectionType === "shared") return item.path;
  if (item.connectionType === "tcpip") return item.localName;
  return item.name;
}

function displayPath(item: PrinterPreference): string {
  if (item.connectionType === "shared") return item.path;
  if (item.connectionType === "tcpip") return item.ipAddress;
  return item.path;
}

type EditingState = { connectionType: PrinterPreference["connectionType"]; item?: PrinterPreference } | null;

/** Mirrors real GPME's Benutzerkonfiguration > Einstellungen > Systemsteuerungseinstellungen > Drucker list view. */
export function PrinterPreferencesPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: PrinterPreference }>();
  const [editing, setEditing] = useState<EditingState>(null);

  const query = useQuery({
    queryKey: ["gpp-printers", gpo.guid],
    queryFn: () => api.get<PrinterPreference[]>(`/api/gpo/${gpo.guid}/printers`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-printers", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/printers/${uid}`),
    onSuccess: () => {
      pushToast("success", "Druckerverbindung gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: PrinterPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    {
      label: "Neu",
      children: [
        { label: "Freigegebener Drucker...", onClick: () => setEditing({ connectionType: "shared" }) },
        { label: "Lokaler Drucker...", onClick: () => setEditing({ connectionType: "local" }) },
        { label: "TCP/IP-Drucker...", onClick: () => setEditing({ connectionType: "tcpip" }) },
      ],
    },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ connectionType: menu.item!.connectionType, item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Druckerverbindung "${displayName(menu.item!)}" wirklich löschen?`)) {
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
          <rect x="3" y="5" width="10" height="6" rx="0.5" fill="#E0E0E0" stroke="#9E9E9E" strokeWidth="0.5" />
          <rect x="4" y="1" width="8" height="5" fill="white" stroke="#9E9E9E" strokeWidth="0.5" />
          <rect x="4" y="11" width="8" height="4" fill="white" stroke="#9E9E9E" strokeWidth="0.5" />
          <circle cx="11" cy="7.5" r="0.8" fill="#4CAF50" />
        </svg>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Drucker</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Druckerverbindungen, die für Benutzer bereitgestellt werden.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um eine Druckerverbindung hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Reihenfolge</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Pfad</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Standard</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ connectionType: item.connectionType, item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{displayName(item)}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.order + 1}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{displayPath(item)}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.default ? "Ja" : "Nein"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}

      {editing?.connectionType === "shared" && (
        <SharedPrinterDialog
          gpo={gpo}
          item={editing.item as Extract<PrinterPreference, { connectionType: "shared" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.connectionType === "local" && (
        <LocalPrinterDialog
          gpo={gpo}
          item={editing.item as Extract<PrinterPreference, { connectionType: "local" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.connectionType === "tcpip" && (
        <TcpIpPrinterDialog
          gpo={gpo}
          item={editing.item as Extract<PrinterPreference, { connectionType: "tcpip" }> | undefined}
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
