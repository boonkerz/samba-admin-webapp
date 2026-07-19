import { useEffect } from "react";
import { useJobStream } from "../api/useJobStream";
import { LogConsole } from "../components/LogConsole";

export function StepRestoreRun({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const stream = useJobStream(jobId);

  useEffect(() => {
    if (stream.status === "succeeded") onDone();
  }, [stream.status]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Domäne wird aus Sicherung wiederhergestellt…</h2>
      <LogConsole lines={stream.lines} />
      {stream.status === "failed" && (
        <p className="text-sm text-red-600 dark:text-red-400">Wiederherstellung fehlgeschlagen (Exit-Code {stream.exitCode}). Bitte Log prüfen.</p>
      )}
    </div>
  );
}
