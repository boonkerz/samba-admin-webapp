import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateFileShareRequest, FileShareValidationResult } from "@samba-admin/shared";
import { api } from "../api/client";
import { useJobStream } from "../api/useJobStream";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinCheckbox } from "../components/WindowsDialog";
import { LogConsole } from "../components/LogConsole";
import { useToastStore } from "../state/toastStore";

export function NewFileShareDialog({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [comment, setComment] = useState("");
  const [browseable, setBrowseable] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [errors, setErrors] = useState<FileShareValidationResult["errors"]>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const stream = useJobStream(jobId, "/api/fileshares");

  useEffect(() => {
    if (stream.status === "succeeded") {
      pushToast("success", t("fileShares.created", "Share created."));
      queryClient.invalidateQueries({ queryKey: ["fileshares"] });
      onDone();
    }
  }, [stream.status]);

  async function submit() {
    setSubmitting(true);
    setServerError(undefined);
    const params: CreateFileShareRequest = { name, path, comment: comment || undefined, browseable, readOnly };
    try {
      const validation = await api.post<FileShareValidationResult>("/api/fileshares/validate", params);
      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }
      const { jobId } = await api.post<{ jobId: string }>("/api/fileshares", params);
      setJobId(jobId);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const running = !!jobId && stream.status === "running";

  return (
    <WindowsDialog
      title={t("fileShares.newShareTitle", "New Share")}
      onClose={running ? () => {} : onDone}
      footer={
        jobId ? (
          <WindowsButton onClick={onDone} disabled={running}>
            {t("common.close", "Schließen")}
          </WindowsButton>
        ) : (
          <>
            <WindowsButton variant="primary" disabled={submitting} onClick={submit}>
              {t("fileShares.create", "Create")}
            </WindowsButton>
            <WindowsButton onClick={onDone}>{t("common.cancel", "Abbrechen")}</WindowsButton>
          </>
        )
      }
    >
      {jobId ? (
        <div className="space-y-3">
          <LogConsole lines={stream.lines} />
          {stream.status === "failed" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {t("fileShares.createFailed", "Failed (exit code {{code}}). Please check the log.", { code: stream.exitCode })}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <WinLabel>{t("fileShares.nameLabel", "Share name:")}</WinLabel>
            <WinInput value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
          </div>
          <div>
            <WinLabel>{t("fileShares.pathLabel", "Folder path:")}</WinLabel>
            <WinInput value={path} onChange={(e) => setPath(e.target.value)} placeholder="/srv/shares/example" />
            {errors.path && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.path}</p>}
          </div>
          <div>
            <WinLabel>{t("fileShares.commentLabel", "Description (optional):")}</WinLabel>
            <WinInput value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <WinCheckbox label={t("fileShares.browseableLabel", "Browseable")} checked={browseable} onChange={(e) => setBrowseable(e.target.checked)} />
          <WinCheckbox label={t("fileShares.readOnlyLabel", "Read-only")} checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
          {serverError && <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>}
        </div>
      )}
    </WindowsDialog>
  );
}
