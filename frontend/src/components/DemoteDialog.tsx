import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DemoteEligibility } from "@samba-admin/shared";
import { api } from "../api/client";
import { useJobStream } from "../api/useJobStream";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "./WindowsDialog";
import { LogConsole } from "./LogConsole";

/** "Remove a domain controller" — the counterpart to the setup wizard's join step. Reachable from the danger zone in Server Status. */
export function DemoteDialog({ hostname, onClose }: { hostname: string; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [jobId, setJobId] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const stream = useJobStream(jobId, "/api/demote");

  const eligibilityQuery = useQuery({
    queryKey: ["demote-eligibility"],
    queryFn: () => api.get<DemoteEligibility>("/api/demote/eligibility"),
  });

  async function startDemote() {
    setStarting(true);
    setError(undefined);
    try {
      const { jobId } = await api.post<{ jobId: string }>("/api/demote", {});
      setJobId(jobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  const eligibility = eligibilityQuery.data;
  const confirmed = confirmText === hostname;
  const running = stream.status === "running";

  const succeeded = stream.status === "succeeded";

  if (jobId) {
    return (
      <WindowsDialog
        title="Domain Controller wird entfernt"
        onClose={running ? () => {} : succeeded ? () => window.location.reload() : onClose}
        footer={
          <WindowsButton onClick={succeeded ? () => window.location.reload() : onClose} disabled={running}>
            Schließen
          </WindowsButton>
        }
      >
        <div className="space-y-4">
          <LogConsole lines={stream.lines} />
          {stream.status === "succeeded" && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Erfolgreich entfernt. Dieser Server ist kein Domain Controller mehr — nach dem Schließen wird die Seite neu geladen und zeigt
              wieder den Einrichtungsassistenten.
            </p>
          )}
          {stream.status === "failed" && (
            <p className="text-sm text-red-600 dark:text-red-400">Fehlgeschlagen (Exit-Code {stream.exitCode}). Bitte Log prüfen.</p>
          )}
        </div>
      </WindowsDialog>
    );
  }

  return (
    <WindowsDialog
      title="Domain Controller entfernen"
      onClose={onClose}
      footer={
        <>
          <WindowsButton disabled={!eligibility?.eligible || !confirmed || starting} onClick={startDemote}>
            Entfernen
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Warnung: Dieser Vorgang entfernt diesen Server dauerhaft als Domain Controller aus der Domäne. Der Server kann anschließend neu
          provisioniert oder einer Domäne erneut beitreten, ist aber bis dahin kein Domain Controller mehr.
        </p>

        {eligibilityQuery.isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Prüfe...</p>}

        {eligibility && !eligibility.eligible && <p className="text-sm text-red-600 dark:text-red-400">{eligibility.reason}</p>}

        {eligibility?.eligible && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Aktuell gibt es {eligibility.dcCount} Domain Controller in dieser Domäne. Zur Bestätigung bitte den Hostnamen dieses Servers
              eingeben:
            </p>
            <div>
              <WinLabel>{hostname}</WinLabel>
              <WinInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={hostname} />
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </WindowsDialog>
  );
}
