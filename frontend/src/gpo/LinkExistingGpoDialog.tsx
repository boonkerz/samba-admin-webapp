import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

/** Mirrors real GPMC's "Vorhandenes Gruppenrichtlinienobjekt verknüpfen..." (right-click an OU). */
export function LinkExistingGpoDialog({ targetDn, targetName, onDone }: { targetDn: string; targetName: string; onDone: () => void }) {
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const gposQuery = useQuery({
    queryKey: ["gpo-list"],
    queryFn: () => api.get<GpoObject[]>("/api/directory/gpos"),
  });

  const linkMutation = useMutation({
    mutationFn: (guid: string) => api.post(`/api/directory/gpos/${guid}/links`, { targetDn }),
    onSuccess: () => {
      pushToast("success", "Gruppenrichtlinienobjekt verknüpft.");
      queryClient.invalidateQueries({ queryKey: ["gpo-list"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const gpos = gposQuery.data ?? [];

  function submit() {
    if (selectedGuid && !linkMutation.isPending) linkMutation.mutate(selectedGuid);
  }

  return (
    <WindowsDialog
      title="Gruppenrichtlinienobjekt auswählen"
      createIn={targetName}
      onClose={onDone}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!selectedGuid || linkMutation.isPending} onClick={submit}>
            OK
          </WindowsButton>
          <WindowsButton type="button" onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="max-h-72 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
        {gposQuery.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : gpos.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Keine Gruppenrichtlinienobjekte vorhanden.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1">Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {gpos.map((gpo) => (
                <tr
                  key={gpo.guid}
                  onClick={() => setSelectedGuid(gpo.guid)}
                  className={`cursor-pointer ${
                    selectedGuid === gpo.guid ? "bg-indigo-50 dark:bg-indigo-950" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <td className="px-2 py-1 text-slate-800 dark:text-slate-100">{gpo.displayName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </WindowsDialog>
  );
}
