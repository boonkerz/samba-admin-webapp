import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, NetworkOptionsPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { VpnConnectionDialog, DunConnectionDialog } from "./NetworkOptionsDialogs";

const ACTION_LABELS: Record<NetworkOptionsPreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

function displayTarget(item: NetworkOptionsPreference): string {
  return item.kind === "vpn" ? item.ipAddress : item.phoneNumber;
}

type EditingState = { kind: "vpn" | "dun"; item?: NetworkOptionsPreference } | null;

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Netzwerkoptionen list view. */
export function NetworkOptionsPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: NetworkOptionsPreference }>();
  const [editing, setEditing] = useState<EditingState>(null);

  const query = useQuery({
    queryKey: ["gpp-networkoptions", gpo.guid],
    queryFn: () => api.get<NetworkOptionsPreference[]>(`/api/gpo/${gpo.guid}/networkoptions`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-networkoptions", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/networkoptions/${uid}`),
    onSuccess: () => {
      pushToast("success", "Netzwerkverbindung gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: NetworkOptionsPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    {
      label: "Neu",
      children: [
        { label: "VPN-Verbindung...", onClick: () => setEditing({ kind: "vpn" }) },
        { label: "DFÜ-Verbindung...", onClick: () => setEditing({ kind: "dun" }) },
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
              if (confirm(`"${menu.item!.name}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Netzwerkoptionen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">VPN- und DFÜ-Verbindungen für Benutzer.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um eine Netzwerkverbindung hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Ziel</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.name}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.kind === "vpn" ? "VPN" : "DFÜ"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{displayTarget(item)}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing?.kind === "vpn" && (
        <VpnConnectionDialog
          gpo={gpo}
          item={editing.item as Extract<NetworkOptionsPreference, { kind: "vpn" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "dun" && (
        <DunConnectionDialog
          gpo={gpo}
          item={editing.item as Extract<NetworkOptionsPreference, { kind: "dun" }> | undefined}
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
