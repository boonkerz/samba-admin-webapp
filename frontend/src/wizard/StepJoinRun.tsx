import { useEffect } from "react";
import { useJobStream } from "../api/useJobStream";
import { LogConsole } from "../components/LogConsole";

export function StepJoinRun({ jobId, onDone }: { jobId: string; onDone: () => void }) {
  const stream = useJobStream(jobId);

  useEffect(() => {
    if (stream.status === "succeeded") onDone();
  }, [stream.status]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Server tritt der Domäne bei…</h2>
      <LogConsole lines={stream.lines} />
      {stream.status === "failed" && (
        <p className="text-sm text-red-600 dark:text-red-400">Domänenbeitritt fehlgeschlagen (Exit-Code {stream.exitCode}). Bitte Log prüfen.</p>
      )}
    </div>
  );
}
