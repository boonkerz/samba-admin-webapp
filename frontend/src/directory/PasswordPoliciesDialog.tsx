import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryObjectSummary, PasswordSettingsObject } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { WindowsDialog, WindowsButton } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { dnToCn } from "./dnPath";
import { ObjectPickerDialog } from "./ObjectPickerDialog";
import { NewPsoDialog } from "./NewPsoDialog";

/**
 * Fine-Grained Password Policy management — real Windows only exposes this via ADAC
 * (Active Directory Administrative Center), not ADUC itself. Reachable here from the
 * domain root's "Kennwortrichtlinien..." context menu entry.
 */
export function PasswordPoliciesDialog({ onClose }: { onClose: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const [appliesToFor, setAppliesToFor] = useState<PasswordSettingsObject | null>(null);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const psosQuery = useQuery({ queryKey: ["psos"], queryFn: () => api.get<PasswordSettingsObject[]>("/api/directory/psos") });

  const deleteMutation = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/directory/psos/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "Kennworteinstellungen gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["psos"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const psos = [...(psosQuery.data ?? [])].sort((a, b) => a.precedence - b.precedence);

  return (
    <WindowsDialog
      title="Kennworteinstellungsobjekte (Fine-Grained Password Policies)"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      footer={
        <>
          <WindowsButton type="button" onClick={() => setShowNew(true)}>
            Neu...
          </WindowsButton>
          <WindowsButton type="button" onClick={onClose}>
            Schließen
          </WindowsButton>
        </>
      }
    >
      <div className="max-h-96 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Präzedenz</th>
              <th className="px-2 py-1">Min. Länge</th>
              <th className="px-2 py-1">Max. Alter (Tage)</th>
              <th className="px-2 py-1">Sperrschwelle</th>
              <th className="px-2 py-1">Gilt für</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {psos.map((pso) => (
              <tr key={pso.dn}>
                <td className="px-2 py-1 text-slate-800 dark:text-slate-100">{pso.name}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{pso.precedence}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{pso.minimumPasswordLengthChars}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{pso.maximumPasswordAgeDays}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{pso.lockoutThreshold || "Deaktiviert"}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">
                  <button className="text-xs text-indigo-600 hover:underline" onClick={() => setAppliesToFor(pso)}>
                    {pso.appliesTo.length} Objekt(e)
                  </button>
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      if (confirm(`Kennworteinstellungen "${pso.name}" wirklich löschen?`)) deleteMutation.mutate(pso.dn);
                    }}
                  >
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
            {psos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                  Keine Kennworteinstellungsobjekte vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && <NewPsoDialog onDone={() => setShowNew(false)} />}
      {appliesToFor && <PsoAppliesToDialog pso={appliesToFor} onClose={() => setAppliesToFor(null)} />}
    </WindowsDialog>
  );
}

function PsoAppliesToDialog({ pso, onClose }: { pso: PasswordSettingsObject; onClose: () => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const addMutation = useMutation({
    mutationFn: (targetDn: string) => api.post(`/api/directory/psos/${encodeDn(pso.dn)}/applies-to`, { targetDn }),
    onSuccess: () => {
      pushToast("success", "Hinzugefügt.");
      queryClient.invalidateQueries({ queryKey: ["psos"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (targetDn: string) => api.delete(`/api/directory/psos/${encodeDn(pso.dn)}/applies-to/${encodeDn(targetDn)}`),
    onSuccess: () => {
      pushToast("success", "Entfernt.");
      queryClient.invalidateQueries({ queryKey: ["psos"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handlePicked(objects: DirectoryObjectSummary[]) {
    setShowPicker(false);
    for (const obj of objects) addMutation.mutate(obj.dn);
  }

  return (
    <WindowsDialog
      title={`Gilt für — ${pso.name}`}
      onClose={onClose}
      footer={
        <>
          <WindowsButton type="button" onClick={() => setShowPicker(true)}>
            Hinzufügen...
          </WindowsButton>
          <WindowsButton type="button" onClick={onClose}>
            Schließen
          </WindowsButton>
        </>
      }
    >
      <div className="max-h-72 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pso.appliesTo.map((dn) => (
              <tr key={dn}>
                <td className="px-2 py-1 text-slate-800 dark:text-slate-100">{dnToCn(dn)}</td>
                <td className="px-2 py-1 text-right">
                  <button className="text-xs text-red-600 hover:underline" onClick={() => removeMutation.mutate(dn)}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
            {pso.appliesTo.length === 0 && (
              <tr>
                <td colSpan={2} className="px-2 py-4 text-center text-slate-400">
                  Gilt bisher für keine Benutzer oder Gruppen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPicker && <ObjectPickerDialog title="Benutzer oder Gruppen auswählen" type="user" onSelect={handlePicked} onClose={() => setShowPicker(false)} />}
    </WindowsDialog>
  );
}
