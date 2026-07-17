import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobSnapshot } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";

/**
 * GPO creation runs `samba-tool ntacl sysvolreset` (several minutes, no
 * output for most of that time) as a background job rather than one long
 * HTTP request — an idle connection that long gets silently dropped by many
 * routers/NAT devices well before the server finishes, even though the
 * server keeps working and the operation completes regardless. Polling a
 * short status endpoint every few seconds avoids ever holding one
 * connection open for more than a moment.
 */
export function useGpoCreateJob(onDone: () => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const startMutation = useMutation({
    mutationFn: (body: { displayName: string; linkToDn?: string }) => api.post<{ jobId: string }>("/api/gpo/create-job", body),
    onSuccess: (data) => setJobId(data.jobId),
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const jobQuery = useQuery({
    queryKey: ["gpo-create-job", jobId],
    queryFn: () => api.get<JobSnapshot>(`/api/gpo/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
  });

  const job = jobQuery.data;

  useEffect(() => {
    if (jobId === null || !job) return;
    if (job.status === "succeeded") {
      queryClient.invalidateQueries({ queryKey: ["gpo-list"] });
      pushToast("success", "Gruppenrichtlinienobjekt erstellt.");
      setJobId(null);
      onDone();
    } else if (job.status === "failed") {
      const errorLine = [...job.lines].reverse().find((l) => l.stream === "stderr");
      pushToast("error", errorLine?.text ?? "Erstellung fehlgeschlagen.");
      setJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, jobId]);

  return {
    start: (body: { displayName: string; linkToDn?: string }) => startMutation.mutate(body),
    pending: startMutation.isPending || (jobId !== null && job?.status !== "succeeded" && job?.status !== "failed"),
  };
}
