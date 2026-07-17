import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { AuditEntry } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinSelect } from "./WindowsDialog";

/** Browses the audit trail every mutation in this app already writes via auditLog() — no dedicated viewer existed before this. */
export function AuditLogDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [actor, setActor] = useState("");
  const [operation, setOperation] = useState("");
  const [search, setSearch] = useState("");

  const facetsQuery = useQuery({
    queryKey: ["audit-log-facets"],
    queryFn: () => api.get<{ actors: string[]; operations: string[] }>("/api/directory/audit-log/facets"),
  });

  const entriesQuery = useQuery({
    queryKey: ["audit-log", actor, operation, search],
    queryFn: () =>
      api.get<AuditEntry[]>(
        `/api/directory/audit-log?limit=200${actor ? `&actor=${encodeURIComponent(actor)}` : ""}${
          operation ? `&operation=${encodeURIComponent(operation)}` : ""
        }${search ? `&search=${encodeURIComponent(search)}` : ""}`
      ),
  });

  const facets = facetsQuery.data ?? { actors: [], operations: [] };
  const entries = entriesQuery.data ?? [];

  return (
    <WindowsDialog
      title={t("auditLog.title", "Protokoll")}
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      footer={
        <WindowsButton type="button" onClick={onClose}>
          {t("common.close", "Schließen")}
        </WindowsButton>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <WinSelect value={actor} onChange={(e) => setActor(e.target.value)} className="max-w-xs">
            <option value="">{t("auditLog.allUsers", "Alle Benutzer")}</option>
            {facets.actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </WinSelect>
          <WinSelect value={operation} onChange={(e) => setOperation(e.target.value)} className="max-w-xs">
            <option value="">{t("auditLog.allActions", "Alle Aktionen")}</option>
            {facets.operations.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </WinSelect>
          <WinInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("auditLog.searchPlaceholder", "Suchen...")}
            className="flex-1"
          />
        </div>

        <div className="max-h-[28rem] overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1">{t("auditLog.time", "Zeitpunkt")}</th>
                <th className="px-2 py-1">{t("auditLog.user", "Benutzer")}</th>
                <th className="px-2 py-1">{t("auditLog.action", "Aktion")}</th>
                <th className="px-2 py-1">{t("auditLog.target", "Ziel")}</th>
                <th className="px-2 py-1">{t("auditLog.detail", "Details")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{entry.actor}</td>
                  <td className="px-2 py-1 font-mono text-xs text-slate-700 dark:text-slate-300">{entry.operation}</td>
                  <td className="max-w-xs truncate px-2 py-1 text-slate-500 dark:text-slate-400" title={entry.targetDn}>
                    {entry.targetDn}
                  </td>
                  <td className="max-w-xs truncate px-2 py-1 text-slate-500 dark:text-slate-400" title={entry.detail}>
                    {entry.detail ?? ""}
                  </td>
                </tr>
              ))}
              {!entriesQuery.isLoading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-slate-400">
                    {t("auditLog.empty", "Keine Einträge.")}
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
