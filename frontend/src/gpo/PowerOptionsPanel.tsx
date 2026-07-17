import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, PowerOptionsPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { GlobalPowerOptionsXpDialog, PowerSchemeXpDialog, PowerPlanV2Dialog } from "./PowerOptionsDialogs";

const ACTION_LABELS: Record<PowerOptionsPreference["action"], string> = {
  C: "Erstellen",
  R: "Ersetzen",
  U: "Aktualisieren",
  D: "Löschen",
};

const KIND_LABELS: Record<PowerOptionsPreference["kind"], string> = {
  globalXp: "Energieschema (Windows XP)",
  schemeXp: "Energieschema",
  planV2: "Energieplan",
};

function displayName(item: PowerOptionsPreference): string {
  if (item.kind === "globalXp") return "Power Options (Windows XP)";
  return item.name;
}

type EditingState = { kind: PowerOptionsPreference["kind"]; item?: PowerOptionsPreference } | null;

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Energieoptionen list view. */
export function PowerOptionsPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: PowerOptionsPreference }>();
  const [editing, setEditing] = useState<EditingState>(null);

  const query = useQuery({
    queryKey: ["gpp-poweroptions", gpo.guid],
    queryFn: () => api.get<PowerOptionsPreference[]>(`/api/gpo/${gpo.guid}/poweroptions`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-poweroptions", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/poweroptions/${uid}`),
    onSuccess: () => {
      pushToast("success", "Energieoption gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: PowerOptionsPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    {
      label: "Neu",
      children: [
        { label: "Energieschema (Windows XP)...", onClick: () => setEditing({ kind: "globalXp" }) },
        { label: "Energieoptionen (Windows XP)...", onClick: () => setEditing({ kind: "schemeXp" }) },
        { label: "Energieplan (mind. Windows Vista)...", onClick: () => setEditing({ kind: "planV2" }) },
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
              if (confirm(`"${displayName(menu.item!)}" wirklich löschen?`)) {
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
          <rect x="6" y="1" width="4" height="9" rx="2" fill="#78909C" />
          <path d="M4 6a5 5 0 1 0 8 0" stroke="#78909C" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Energieoptionen</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Energieeinstellungen, die für Benutzer bereitgestellt werden.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um eine Energieoption hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Reihenfolge</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.order + 1}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}

      {editing?.kind === "globalXp" && (
        <GlobalPowerOptionsXpDialog
          gpo={gpo}
          item={editing.item as Extract<PowerOptionsPreference, { kind: "globalXp" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "schemeXp" && (
        <PowerSchemeXpDialog
          gpo={gpo}
          item={editing.item as Extract<PowerOptionsPreference, { kind: "schemeXp" }> | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "planV2" && (
        <PowerPlanV2Dialog
          gpo={gpo}
          item={editing.item as Extract<PowerOptionsPreference, { kind: "planV2" }> | undefined}
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
