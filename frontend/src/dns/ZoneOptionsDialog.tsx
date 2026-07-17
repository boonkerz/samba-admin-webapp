import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DnsZoneInfo } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinCheckbox, WinLabel, WinInput } from "../components/WindowsDialog";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";

const ALLOW_UPDATE_LABEL: Record<DnsZoneInfo["allowUpdate"], string> = {
  none: "Keine",
  nonsecure: "Nicht sicher und sicher",
  secure: "Nur sichere Updates",
};

/** Mirrors the "Allgemein" tab of real DNS-Manager's zone Eigenschaften dialog. */
export function ZoneOptionsDialog({ zoneName, onDone }: { zoneName: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [aging, setAging] = useState(false);
  const [noRefreshInterval, setNoRefreshInterval] = useState("168");
  const [refreshInterval, setRefreshInterval] = useState("168");

  const infoQuery = useQuery({
    queryKey: ["dns-zone-info", zoneName],
    queryFn: () => api.get<DnsZoneInfo>(`/api/dns/zones/${encodeURIComponent(zoneName)}`),
  });

  useEffect(() => {
    if (infoQuery.data) {
      setAging(infoQuery.data.aging);
      setNoRefreshInterval(String(infoQuery.data.noRefreshIntervalHours));
      setRefreshInterval(String(infoQuery.data.refreshIntervalHours));
    }
  }, [infoQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/api/dns/zones/${encodeURIComponent(zoneName)}/options`, {
        aging,
        norefreshinterval: Number(noRefreshInterval),
        refreshinterval: Number(refreshInterval),
      }),
    onSuccess: () => {
      pushToast("success", "Zoneneigenschaften gespeichert.");
      queryClient.invalidateQueries({ queryKey: ["dns-zone-info", zoneName] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const info = infoQuery.data;

  return (
    <WindowsDialog
      title={`Eigenschaften von ${zoneName}`}
      onClose={onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!info || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird gespeichert…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      {!info ? (
        <p className="text-sm text-slate-400">Lade…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <WinLabel>Zonentyp:</WinLabel>
            <p className="text-slate-700 dark:text-slate-300">
              {info.zoneType === "primary" ? "Primäre Zone" : info.zoneType} {info.dsIntegrated && "(AD-integriert)"}
            </p>
          </div>
          <div>
            <WinLabel>Dynamische Updates:</WinLabel>
            <p className="text-slate-700 dark:text-slate-300">{ALLOW_UPDATE_LABEL[info.allowUpdate]}</p>
          </div>
          <div>
            <WinCheckbox label="Aufräumen von veralteten Ressourceneinträgen aktivieren" checked={aging} onChange={(e) => setAging(e.target.checked)} />
          </div>
          {aging && (
            <div className="grid grid-cols-2 gap-2 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
              <div>
                <WinLabel>Kein Aktualisierungsintervall (Stunden):</WinLabel>
                <WinInput type="number" min={0} value={noRefreshInterval} onChange={(e) => setNoRefreshInterval(e.target.value)} />
              </div>
              <div>
                <WinLabel>Aktualisierungsintervall (Stunden):</WinLabel>
                <WinInput type="number" min={0} value={refreshInterval} onChange={(e) => setRefreshInterval(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}
    </WindowsDialog>
  );
}
