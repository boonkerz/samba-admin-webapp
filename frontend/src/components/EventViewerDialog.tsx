import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { EventLogEntry, EventLogLevel } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinSelect } from "./WindowsDialog";

const LEVEL_BADGE: Record<EventLogLevel, string> = {
  error: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  info: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

/** Closest equivalent to Windows Event Viewer's "System" log — recent journalctl entries for the units this app cares about (samba-ad-dc, smbd, nmbd, winbind, cups). Polled rather than streamed, same simplicity level as the audit log. */
export function EventViewerDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<EventLogLevel | "">("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");

  const sourcesQuery = useQuery({
    queryKey: ["eventlog-sources"],
    queryFn: () => api.get<string[]>("/api/eventlog/sources"),
  });

  const entriesQuery = useQuery({
    queryKey: ["eventlog-entries", level, source, search],
    queryFn: () =>
      api.get<EventLogEntry[]>(
        `/api/eventlog/entries?limit=500${level ? `&level=${level}` : ""}${source ? `&source=${encodeURIComponent(source)}` : ""}${
          search ? `&search=${encodeURIComponent(search)}` : ""
        }`
      ),
    refetchInterval: 10_000,
  });

  const sources = sourcesQuery.data ?? [];
  const entries = entriesQuery.data ?? [];

  return (
    <WindowsDialog
      title={t("eventViewer.title", "Ereignisanzeige")}
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      footer={
        <WindowsButton type="button" onClick={onClose}>
          {t("common.close", "Schließen")}
        </WindowsButton>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <WinSelect value={level} onChange={(e) => setLevel(e.target.value as EventLogLevel | "")} className="max-w-xs">
            <option value="">{t("eventViewer.allLevels", "Alle Ebenen")}</option>
            <option value="error">{t("eventViewer.error", "Fehler")}</option>
            <option value="warning">{t("eventViewer.warning", "Warnung")}</option>
            <option value="info">{t("eventViewer.info", "Information")}</option>
          </WinSelect>
          <WinSelect value={source} onChange={(e) => setSource(e.target.value)} className="max-w-xs">
            <option value="">{t("eventViewer.allSources", "Alle Quellen")}</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </WinSelect>
          <WinInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("eventViewer.searchPlaceholder", "Suchen...")}
            className="flex-1"
          />
        </div>

        <div className="max-h-[28rem] overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1">{t("eventViewer.level", "Ebene")}</th>
                <th className="px-2 py-1">{t("eventViewer.time", "Zeitpunkt")}</th>
                <th className="px-2 py-1">{t("eventViewer.source", "Quelle")}</th>
                <th className="px-2 py-1">{t("eventViewer.message", "Meldung")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-2 py-1">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${LEVEL_BADGE[entry.level]}`}>
                      {t(`eventViewer.${entry.level}`, entry.level)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-slate-700 dark:text-slate-300">{entry.source}</td>
                  <td className="max-w-xl truncate px-2 py-1 text-slate-700 dark:text-slate-300" title={entry.message}>
                    {entry.message}
                  </td>
                </tr>
              ))}
              {!entriesQuery.isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                    {t("eventViewer.empty", "Keine Ereignisse.")}
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
