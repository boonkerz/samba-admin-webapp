import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrintServerStatus } from "@samba-admin/shared";
import { api } from "../api/client";
import { useJobStream } from "../api/useJobStream";
import { Button } from "../components/Button";
import { LogConsole } from "../components/LogConsole";
import { Spinner } from "../components/Spinner";

/**
 * Shared by three call sites: the wizard's opt-in step, the "Drucker" tab's
 * empty state, and the Server Health dialog — one implementation, so the
 * enable flow behaves identically wherever it's triggered from.
 */
export function PrintServerEnablePanel({ onDone }: { onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const stream = useJobStream(jobId, "/api/print-server");

  const statusQuery = useQuery({
    queryKey: ["print-server-status"],
    queryFn: () => api.get<PrintServerStatus>("/api/print-server/status"),
  });

  useEffect(() => {
    if (stream.status === "succeeded") {
      queryClient.invalidateQueries({ queryKey: ["print-server-status"] });
      onDone?.();
    }
  }, [stream.status]);

  async function startEnable() {
    setStarting(true);
    setError(undefined);
    try {
      const { jobId } = await api.post<{ jobId: string }>("/api/print-server/enable");
      setJobId(jobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (jobId) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Druckserver wird eingerichtet…</h3>
        <LogConsole lines={stream.lines} />
        {stream.status === "failed" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Einrichtung fehlgeschlagen (Exit-Code {stream.exitCode}). Bitte Log prüfen.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {statusQuery.data?.ready ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Druckserver ist eingerichtet und aktiv.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Richtet CUPS als Druckdienst ein und aktiviert die Samba-Freigaben <code>[printers]</code>/<code>[print$]</code>, damit dieser
            Server Drucker und Treiber für Windows-Clients bereitstellen kann.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button onClick={startEnable} disabled={starting}>
            {starting && <Spinner className="h-4 w-4" />} Einrichten
          </Button>
        </>
      )}
    </div>
  );
}
