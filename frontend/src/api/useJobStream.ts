import { useEffect, useRef, useState } from "react";
import type { JobLogLine, JobStatus } from "@samba-admin/shared";

export interface JobStreamState {
  lines: JobLogLine[];
  status: JobStatus;
  exitCode?: number;
}

export function useJobStream(jobId: string | undefined, baseUrl: string = "/api/setup"): JobStreamState {
  const [state, setState] = useState<JobStreamState>({ lines: [], status: "running" });
  const seenSeq = useRef(new Set<number>());

  useEffect(() => {
    if (!jobId) return;
    seenSeq.current = new Set();
    setState({ lines: [], status: "running" });

    const source = new EventSource(`${baseUrl}/jobs/${jobId}/stream`);

    source.addEventListener("line", (event) => {
      const line = JSON.parse((event as MessageEvent).data) as JobLogLine;
      if (seenSeq.current.has(line.seq)) return;
      seenSeq.current.add(line.seq);
      setState((prev) => ({ ...prev, lines: [...prev.lines, line] }));
    });

    source.addEventListener("done", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { status: JobStatus; exitCode: number };
      setState((prev) => ({ ...prev, status: payload.status, exitCode: payload.exitCode }));
      source.close();
    });

    source.onerror = () => {
      // EventSource auto-reconnects on transient errors; nothing to do here.
    };

    return () => source.close();
  }, [jobId, baseUrl]);

  return state;
}
