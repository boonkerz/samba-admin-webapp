import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryObjectSummary, GpoAdvancedAce, GpoAdvancedRightsFlags, GpoObject } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton } from "../components/WindowsDialog";
import { ObjectPickerDialog } from "../directory/ObjectPickerDialog";

const EMPTY_FLAGS: GpoAdvancedRightsFlags = { read: false, write: false, createAllChild: false, deleteAllChild: false, applyGroupPolicy: false };

const RIGHT_ROWS: { key: keyof GpoAdvancedRightsFlags; label: string }[] = [
  { key: "read", label: "Lesen" },
  { key: "write", label: "Schreiben" },
  { key: "createAllChild", label: "Alle untergeordneten Objekte erstellen" },
  { key: "deleteAllChild", label: "Alle untergeordneten Objekte löschen" },
  { key: "applyGroupPolicy", label: "Gruppenrichtlinie übernehmen" },
];

/** Mirrors real GPMC's Delegierung > "Erweitert..." (Advanced Security Settings) dialog. */
export function GpoAdvancedSecurityDialog({ gpo, onClose }: { gpo: GpoObject; onClose: () => void }) {
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [allow, setAllow] = useState<GpoAdvancedRightsFlags>(EMPTY_FLAGS);
  const [deny, setDeny] = useState<GpoAdvancedRightsFlags>(EMPTY_FLAGS);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ["gpo-advanced-security", gpo.guid],
    queryFn: () => api.get<GpoAdvancedAce[]>(`/api/directory/gpos/${gpo.guid}/advanced-security`),
  });
  const entries = query.data ?? [];
  const selected = entries.find((e) => e.sid === selectedSid) ?? entries[0];

  useEffect(() => {
    if (selected) {
      setAllow(selected.allow);
      setDeny(selected.deny);
    }
  }, [selected?.sid, selected?.allow, selected?.deny]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpo-advanced-security", gpo.guid] });

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/api/directory/gpos/${gpo.guid}/advanced-security/${encodeDn(selected!.sid)}`, { allow, deny }),
    onSuccess: () => {
      pushToast("success", "Berechtigungen gespeichert.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (sid: string) => api.delete(`/api/directory/gpos/${gpo.guid}/advanced-security/${encodeDn(sid)}`),
    onSuccess: () => {
      pushToast("success", "Eintrag entfernt.");
      setSelectedSid(null);
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const addMutation = useMutation({
    mutationFn: (sid: string) => api.put(`/api/directory/gpos/${gpo.guid}/advanced-security/${encodeDn(sid)}`, { allow: { ...EMPTY_FLAGS, read: true }, deny: EMPTY_FLAGS }),
    onSuccess: () => {
      pushToast("success", "Hinzugefügt.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handlePicked(objects: DirectoryObjectSummary[]) {
    setShowPicker(false);
    for (const obj of objects) {
      if (!obj.objectSid) {
        pushToast("error", `Kein SID für "${obj.name}" gefunden.`);
        continue;
      }
      addMutation.mutate(obj.objectSid);
    }
  }

  return (
    <WindowsDialog
      title={`Sicherheitseinstellungen für ${gpo.displayName}`}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!selected || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Wird gespeichert…" : "Übernehmen"}
          </WindowsButton>
          <WindowsButton type="button" onClick={onClose}>
            Schließen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">Gruppen- oder Benutzernamen:</p>
          <div className="max-h-32 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
            {entries.map((entry) => (
              <div
                key={entry.sid}
                onClick={() => setSelectedSid(entry.sid)}
                className={`cursor-pointer px-2 py-1 text-sm ${
                  selected?.sid === entry.sid ? "bg-indigo-100 dark:bg-indigo-900/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                {entry.name}
                {entry.inherited && <span className="ml-2 text-xs text-slate-400">(Standard)</span>}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <WindowsButton type="button" onClick={() => setShowPicker(true)}>
              Hinzufügen...
            </WindowsButton>
            <WindowsButton
              type="button"
              disabled={!selected || selected.inherited}
              onClick={() => {
                if (selected && confirm(`Eintrag für "${selected.name}" wirklich entfernen?`)) removeMutation.mutate(selected.sid);
              }}
            >
              Entfernen
            </WindowsButton>
          </div>
        </div>

        {selected && (
          <div>
            <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">Berechtigungen für "{selected.name}":</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-600">
                  <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300" />
                  <th className="w-20 px-2 py-1 text-center font-medium text-slate-600 dark:text-slate-300">Zulassen</th>
                  <th className="w-20 px-2 py-1 text-center font-medium text-slate-600 dark:text-slate-300">Verweigern</th>
                </tr>
              </thead>
              <tbody>
                {RIGHT_ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{row.label}</td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        disabled={selected.inherited}
                        checked={allow[row.key]}
                        onChange={(e) => setAllow((f) => ({ ...f, [row.key]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        disabled={selected.inherited}
                        checked={deny[row.key]}
                        onChange={(e) => setDeny((f) => ({ ...f, [row.key]: e.target.checked }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">
              "Spezielle Berechtigungen" (z. B. Besitz übernehmen, Sicherheit ändern) werden hier nicht einzeln angezeigt/bearbeitet.
            </p>
          </div>
        )}
      </div>

      {showPicker && <ObjectPickerDialog title="Gruppen auswählen" type="group" onSelect={handlePicked} onClose={() => setShowPicker(false)} />}
    </WindowsDialog>
  );
}
