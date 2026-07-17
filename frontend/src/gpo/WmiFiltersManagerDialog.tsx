import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WmiFilterRef } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinTextarea } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

/** Mirrors real GPMC's "WMI-Filter" management node — list, create, and delete filters (separate from assigning one to a GPO). */
export function WmiFiltersManagerDialog({ onClose }: { onClose: () => void }) {
  const [showNew, setShowNew] = useState(false);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const filtersQuery = useQuery({ queryKey: ["wmi-filters"], queryFn: () => api.get<WmiFilterRef[]>("/api/directory/wmi-filters") });

  const deleteMutation = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/directory/wmi-filters/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "WMI-Filter gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["wmi-filters"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const filters = filtersQuery.data ?? [];

  return (
    <WindowsDialog
      title="WMI-Filter"
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
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
              <th className="px-2 py-1">Beschreibung</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filters.map((f) => (
              <tr key={f.dn}>
                <td className="px-2 py-1 text-slate-800 dark:text-slate-100">{f.name}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{f.description ?? ""}</td>
                <td className="px-2 py-1 text-right">
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      if (confirm(`WMI-Filter "${f.name}" wirklich löschen?`)) deleteMutation.mutate(f.dn);
                    }}
                  >
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
            {filters.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2 py-4 text-center text-slate-400">
                  Keine WMI-Filter vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && <NewWmiFilterDialog onDone={() => setShowNew(false)} />}
    </WindowsDialog>
  );
}

function NewWmiFilterDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [namespace, setNamespace] = useState("root\\CIMv2");
  const [query, setQuery] = useState("SELECT * FROM Win32_OperatingSystem");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/directory/wmi-filters", { name, description, namespace, query }),
    onSuccess: () => {
      pushToast("success", "WMI-Filter erstellt.");
      queryClient.invalidateQueries({ queryKey: ["wmi-filters"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = name.trim().length > 0 && query.trim().length > 0;

  return (
    <WindowsDialog
      title="Neuer WMI-Filter"
      onClose={mutation.isPending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "Speichern"}
          </WindowsButton>
          <WindowsButton type="button" disabled={mutation.isPending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Beschreibung:</WinLabel>
          <WinInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <WinLabel>Namespace:</WinLabel>
          <WinInput value={namespace} onChange={(e) => setNamespace(e.target.value)} />
        </div>
        <div>
          <WinLabel>Abfrage (WQL):</WinLabel>
          <WinTextarea value={query} onChange={(e) => setQuery(e.target.value)} rows={3} />
        </div>
      </div>
    </WindowsDialog>
  );
}
