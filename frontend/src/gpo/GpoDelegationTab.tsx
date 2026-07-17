import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryObjectSummary, GpoDelegationEntry, GpoDelegationPermission, GpoObject } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsButton, WinSelect } from "../components/WindowsDialog";
import { ObjectPickerDialog } from "../directory/ObjectPickerDialog";
import { GpoAdvancedSecurityDialog } from "./GpoAdvancedSecurityDialog";

const PERMISSION_LABELS: Record<GpoDelegationPermission, string> = {
  read: "Lesen",
  edit: "Einstellungen bearbeiten",
  editDeleteModifySecurity: "Einstellungen bearbeiten, löschen, Sicherheit ändern",
};

/** Mirrors real GPMC's GPO Properties > Delegierung tab. */
export function GpoDelegationTab({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [showPicker, setShowPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const query = useQuery({
    queryKey: ["gpo-delegation", gpo.guid],
    queryFn: () => api.get<GpoDelegationEntry[]>(`/api/directory/gpos/${gpo.guid}/delegation`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpo-delegation", gpo.guid] });

  const addMutation = useMutation({
    mutationFn: ({ sid, permission }: { sid: string; permission: GpoDelegationPermission }) =>
      api.post(`/api/directory/gpos/${gpo.guid}/delegation`, { sid, permission }),
    onSuccess: () => {
      pushToast("success", "Berechtigung hinzugefügt.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ sid, permission }: { sid: string; permission: GpoDelegationPermission }) =>
      api.put(`/api/directory/gpos/${gpo.guid}/delegation/${encodeURIComponent(sid)}`, { permission }),
    onSuccess: () => {
      pushToast("success", "Berechtigung aktualisiert.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (sid: string) => api.delete(`/api/directory/gpos/${gpo.guid}/delegation/${encodeURIComponent(sid)}`),
    onSuccess: () => {
      pushToast("success", "Berechtigung entfernt.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handlePick(objects: DirectoryObjectSummary[]) {
    setShowPicker(false);
    for (const obj of objects) {
      if (!obj.objectSid) {
        pushToast("error", `Kein SID für "${obj.name}" gefunden.`);
        continue;
      }
      addMutation.mutate({ sid: obj.objectSid, permission: "read" });
    }
  }

  const entries = query.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Diese Berechtigungen legen fest, welche Gruppen und Benutzer dieses Gruppenrichtlinienobjekt lesen und bearbeiten dürfen.
      </p>
      {query.isLoading ? (
        <p className="text-sm text-slate-400">Lade…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Berechtigungen</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.sid} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{entry.name}</td>
                <td className="px-2 py-1">
                  {entry.inherited ? (
                    <span className="text-slate-500 dark:text-slate-400">{PERMISSION_LABELS[entry.permission]}</span>
                  ) : (
                    <WinSelect
                      value={entry.permission}
                      onChange={(e) => updateMutation.mutate({ sid: entry.sid, permission: e.target.value as GpoDelegationPermission })}
                    >
                      {Object.entries(PERMISSION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </WinSelect>
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-slate-600"
                    disabled={entry.inherited}
                    onClick={() => {
                      if (confirm(`Berechtigung für "${entry.name}" wirklich entfernen?`)) removeMutation.mutate(entry.sid);
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
      <div className="flex gap-2">
        <WindowsButton onClick={() => setShowPicker(true)}>Hinzufügen...</WindowsButton>
        <WindowsButton onClick={() => setShowAdvanced(true)}>Erweitert...</WindowsButton>
      </div>

      {showPicker && <ObjectPickerDialog title="Gruppen auswählen" type="group" onSelect={handlePick} onClose={() => setShowPicker(false)} />}
      {showAdvanced && <GpoAdvancedSecurityDialog gpo={gpo} onClose={() => setShowAdvanced(false)} />}
    </div>
  );
}
