import { useEffect, useRef } from "react";
import type { JobLogLine } from "@samba-admin/shared";

const STREAM_CLASSES: Record<JobLogLine["stream"], string> = {
  stdout: "text-slate-200",
  stderr: "text-red-400",
  meta: "text-cyan-400",
};

export function LogConsole({ lines }: { lines: JobLogLine[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div className="h-72 overflow-y-auto rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed">
      {lines.length === 0 && <p className="text-slate-500">Warte auf Ausgabe…</p>}
      {lines.map((line) => (
        <div key={line.seq} className={STREAM_CLASSES[line.stream]}>
          {line.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
