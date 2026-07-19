import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BackupFileInfo } from "@samba-admin/shared";
import { api } from "../api/client";
import { useJobStream } from "../api/useJobStream";
import { WindowsDialog, WindowsButton } from "./WindowsDialog";
import { LogConsole } from "./LogConsole";
import { useToastStore } from "../state/toastStore";

/** Full domain backups (samba-tool domain backup online) — download for safekeeping, or feed into the setup wizard's "restore from backup" mode on a fresh server. */
export function BackupDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [jobId, setJobId] = useState<string>();
  const [starting, setStarting] = useState(false);
  const stream = useJobStream(jobId, "/api/backup");

  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: () => api.get<BackupFileInfo[]>("/api/backup/list"),
  });

  useEffect(() => {
    if (stream.status === "succeeded") {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      pushToast("success", t("backup.created", "Sicherung erstellt."));
    }
  }, [stream.status]);

  async function startBackup() {
    setStarting(true);
    try {
      const { jobId } = await api.post<{ jobId: string }>("/api/backup/create", {});
      setJobId(jobId);
    } catch (err) {
      pushToast("error", (err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function removeBackup(filename: string) {
    await api.delete(`/api/backup/${encodeURIComponent(filename)}`);
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  }

  const backups = backupsQuery.data ?? [];
  // useJobStream defaults to status "running" even with no jobId yet (it
  // assumes the wizard-step pattern where a job always starts immediately)
  // — gate on jobId too so the buttons aren't disabled before anything
  // has actually started.
  const running = !!jobId && stream.status === "running";

  return (
    <WindowsDialog
      title={t("backup.title", "Sicherungen")}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={
        <WindowsButton onClick={onClose} disabled={running}>
          {t("common.close", "Schließen")}
        </WindowsButton>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t(
              "backup.description",
              'Erstellt eine vollständige Sicherung der Verzeichnisdatenbank (inkl. aller Geheimnisse) als Datei zum Download. Kann später über "Aus Sicherung wiederherstellen" im Einrichtungsassistenten auf einem neuen Server verwendet werden.'
            )}
          </p>
          <WindowsButton variant="primary" onClick={startBackup} disabled={starting || running}>
            {t("backup.create", "Sicherung erstellen")}
          </WindowsButton>
        </div>

        {jobId && stream.lines.length > 0 && <LogConsole lines={stream.lines} />}
        {stream.status === "failed" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {t("backup.failed", "Fehlgeschlagen (Exit-Code {{code}}). Bitte Log prüfen.", { code: stream.exitCode })}
          </p>
        )}

        <div className="max-h-80 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1">{t("backup.file", "Datei")}</th>
                <th className="px-2 py-1">{t("backup.size", "Größe")}</th>
                <th className="px-2 py-1">{t("backup.createdAt", "Erstellt")}</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {backups.map((b) => (
                <tr key={b.filename}>
                  <td className="max-w-xs truncate px-2 py-1 font-mono text-xs text-slate-700 dark:text-slate-300" title={b.filename}>
                    {b.filename}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-slate-700 dark:text-slate-300">
                    {(b.sizeBytes / 1024 / 1024).toFixed(1)} MB
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <a
                      className="mr-3 text-indigo-600 hover:underline dark:text-indigo-400"
                      href={`/api/backup/download/${encodeURIComponent(b.filename)}`}
                    >
                      {t("backup.download", "Herunterladen")}
                    </a>
                    <button className="text-red-600 hover:underline dark:text-red-400" onClick={() => removeBackup(b.filename)}>
                      {t("backup.delete", "Löschen")}
                    </button>
                  </td>
                </tr>
              ))}
              {!backupsQuery.isLoading && backups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                    {t("backup.none", "Keine Sicherungen vorhanden.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </WindowsDialog>
  );
}
