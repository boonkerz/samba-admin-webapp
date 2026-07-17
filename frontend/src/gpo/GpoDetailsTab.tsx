import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoDetails, GpoObject, GpoStatus } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WinLabel, WinSelect } from "../components/WindowsDialog";

const STATUS_LABELS: Record<GpoStatus, string> = {
  enabled: "Aktiviert",
  userDisabled: "Benutzerkonfigurationseinstellungen deaktiviert",
  computerDisabled: "Computerkonfigurationseinstellungen deaktiviert",
  allDisabled: "Alle Einstellungen deaktiviert",
};

/** Mirrors real GPMC's GPO Properties > Details tab. */
export function GpoDetailsTab({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ["gpo-details", gpo.guid],
    queryFn: () => api.get<GpoDetails>(`/api/directory/gpos/${gpo.guid}/details`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: GpoStatus) => api.put(`/api/directory/gpos/${gpo.guid}/status`, { status }),
    onSuccess: () => {
      pushToast("success", "GPO-Status aktualisiert.");
      queryClient.invalidateQueries({ queryKey: ["gpo-details", gpo.guid] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const details = query.data;

  if (query.isLoading) return <p className="text-sm text-slate-400">Lade…</p>;
  if (!details) return <p className="text-sm text-slate-400">Keine Details verfügbar.</p>;

  return (
    <div className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <WinLabel>Domäne:</WinLabel>
          <p className="text-sm text-slate-700 dark:text-slate-300">{details.domain}</p>
        </div>
        <div>
          <WinLabel>Besitzer:</WinLabel>
          <p className="text-sm text-slate-700 dark:text-slate-300">{details.owner}</p>
        </div>
        <div>
          <WinLabel>Erstellt:</WinLabel>
          <p className="text-sm text-slate-700 dark:text-slate-300">{details.createdTime ?? "—"}</p>
        </div>
        <div>
          <WinLabel>Geändert:</WinLabel>
          <p className="text-sm text-slate-700 dark:text-slate-300">{details.modifiedTime ?? "—"}</p>
        </div>
        <div>
          <WinLabel>Eindeutige Kennung:</WinLabel>
          <p className="break-all font-mono text-xs text-slate-700 dark:text-slate-300">{`{${gpo.guid}}`}</p>
        </div>
        <div>
          <WinLabel>Versionen (Active Directory/SYSVOL):</WinLabel>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {details.adVersion} / {details.sysvolVersion}
          </p>
        </div>
      </div>
      <div>
        <WinLabel>GPO-Status:</WinLabel>
        <WinSelect value={details.gpoStatus} onChange={(e) => statusMutation.mutate(e.target.value as GpoStatus)}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </WinSelect>
      </div>
    </div>
  );
}
