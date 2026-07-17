import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WindowsDialog, WindowsButton, WinLabel, WinTextarea } from "../components/WindowsDialog";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";

/** Mirrors real DNS-Manager's Server-Eigenschaften > Weiterleitungen tab. */
export function ServerForwardersDialog({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [text, setText] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const forwardersQuery = useQuery({
    queryKey: ["dns-forwarders"],
    queryFn: () => api.get<string[]>("/api/dns/server/forwarders"),
  });

  useEffect(() => {
    if (forwardersQuery.data) setText(forwardersQuery.data.join("\n"));
  }, [forwardersQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put("/api/dns/server/forwarders", {
        ips: text.split("\n").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      pushToast("success", "Weiterleitungen gespeichert. Ein Neustart des DNS-Dienstes ist nötig, damit die Änderung wirksam wird.");
      queryClient.invalidateQueries({ queryKey: ["dns-forwarders"] });
      setJustSaved(true);
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const restartMutation = useMutation({
    mutationFn: () => api.post("/api/dns/server/restart"),
    onSuccess: () => {
      pushToast("success", "Samba-Dienst neu gestartet.");
      setJustSaved(false);
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <WindowsDialog
      title="Server-Eigenschaften — Weiterleitungen"
      onClose={onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Wird gespeichert…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <WinLabel>IP-Adressen der Weiterleitungsserver (eine pro Zeile):</WinLabel>
          <WinTextarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="8.8.8.8" />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Samba liest diese Einstellung nur beim Start des DNS-Dienstes — Änderungen brauchen einen Neustart, um wirksam zu werden. Das
          unterbricht kurzzeitig alle AD/LDAP/DNS-Verbindungen.
        </p>
        {justSaved && (
          <div className="rounded-sm border border-amber-300 bg-amber-50 p-2 dark:border-amber-700 dark:bg-amber-950">
            <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">
              Gespeichert, aber noch nicht aktiv. Jetzt neu starten?
            </p>
            <WindowsButton type="button" disabled={restartMutation.isPending} onClick={() => restartMutation.mutate()}>
              {restartMutation.isPending ? "Wird neu gestartet…" : "Dienst jetzt neu starten"}
            </WindowsButton>
          </div>
        )}
      </div>
    </WindowsDialog>
  );
}
