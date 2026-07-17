import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobSnapshot } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";

/** Generic version of useGpoCreateJob's polling pattern, parametrized by start endpoint/body — used by GPO copy and restore, which also run the multi-minute sysvolreset ACL fix. */
export function useGpoJob<TBody>(startUrl: string, successMessage: string, onDone: (jobId: string) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const startMutation = useMutation({
    mutationFn: (body: TBody) => api.post<{ jobId: string }>(startUrl, body),
    onSuccess: (data) => setJobId(data.jobId),
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const jobQuery = useQuery({
    queryKey: ["gpo-job", startUrl, jobId],
    queryFn: () => api.get<JobSnapshot>(`/api/gpo/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 3000 : false),
  });

  const job = jobQuery.data;

  useEffect(() => {
    if (jobId === null || !job) return;
    if (job.status === "succeeded") {
      queryClient.invalidateQueries({ queryKey: ["gpo-list"] });
      pushToast("success", successMessage);
      const finishedJobId = jobId;
      setJobId(null);
      onDone(finishedJobId);
    } else if (job.status === "failed") {
      const errorLine = [...job.lines].reverse().find((l) => l.stream === "stderr");
      pushToast("error", errorLine?.text ?? "Vorgang fehlgeschlagen.");
      setJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, jobId]);

  return {
    start: (body: TBody) => startMutation.mutate(body),
    pending: startMutation.isPending || (jobId !== null && job?.status !== "succeeded" && job?.status !== "failed"),
  };
}
