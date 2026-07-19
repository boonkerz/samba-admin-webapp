import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PrintServerStatus, PrintSyncStatus, ServerHealthSummary, SysvolSyncStatus } from "@samba-admin/shared";
import { api } from "../api/client";
import { PrintServerEnablePanel } from "../print/PrintServerEnablePanel";
import { WindowsDialog, WindowsButton } from "./WindowsDialog";
import { DemoteDialog } from "./DemoteDialog";
import { BackupDialog } from "./BackupDialog";

const FSMO_ROLE_ORDER: { key: keyof ServerHealthSummary["fsmoRoles"]; labelKey: string }[] = [
  { key: "schemaMaster", labelKey: "health.fsmo.schemaMaster" },
  { key: "domainNamingMaster", labelKey: "health.fsmo.domainNamingMaster" },
  { key: "pdcEmulator", labelKey: "health.fsmo.pdcEmulator" },
  { key: "ridMaster", labelKey: "health.fsmo.ridMaster" },
  { key: "infrastructureMaster", labelKey: "health.fsmo.infrastructureMaster" },
  { key: "domainDnsZonesMaster", labelKey: "health.fsmo.domainDnsZonesMaster" },
  { key: "forestDnsZonesMaster", labelKey: "health.fsmo.forestDnsZonesMaster" },
];

function StatusBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`rounded-sm px-2 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );
}

/** Shared shape between SYSVOL and print-server sync status (see sysvolSync.service.ts / printSync.service.ts) — both are "PDC emulator is the single source, everyone else pulls from it" loops. */
function SyncStatusBlock({
  status,
  sourceLabel,
  unavailableLabel,
  okLabel,
  failedLabel,
  fromLabel,
}: {
  status: SysvolSyncStatus | PrintSyncStatus;
  sourceLabel: string;
  unavailableLabel: string;
  okLabel: string;
  failedLabel: string;
  fromLabel: (dc: string) => string;
}) {
  if (status.role === "source") {
    return <div className="text-sm text-slate-600 dark:text-slate-400">{sourceLabel}</div>;
  }
  if (status.role === "unavailable") {
    return <div className="text-sm text-slate-500 dark:text-slate-400">{unavailableLabel}</div>;
  }
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center gap-3">
        <StatusBadge ok={!!status.lastSyncOk} okLabel={okLabel} badLabel={failedLabel} />
        {status.sourceDc && <span className="text-slate-600 dark:text-slate-400">{fromLabel(status.sourceDc)}</span>}
        {status.lastSyncAt && <span className="text-xs text-slate-400">{new Date(status.lastSyncAt).toLocaleString()}</span>}
      </div>
      {status.lastError && <div className="text-xs text-red-600 dark:text-red-400">{status.lastError}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

export function ServerHealthDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showPrintSetup, setShowPrintSetup] = useState(false);
  const [showDemote, setShowDemote] = useState(false);
  const [showBackup, setShowBackup] = useState(false);

  const healthQuery = useQuery({
    queryKey: ["server-health"],
    queryFn: () => api.get<ServerHealthSummary>("/api/directory/health"),
    refetchInterval: 30000,
  });

  const printStatusQuery = useQuery({
    queryKey: ["print-server-status"],
    queryFn: () => api.get<PrintServerStatus>("/api/print-server/status"),
  });

  const health = healthQuery.data;

  return (
    <WindowsDialog
      title={t("health.title", "Serverstatus")}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={
        <WindowsButton type="button" onClick={onClose}>
          {t("common.close", "Schließen")}
        </WindowsButton>
      }
    >
      {healthQuery.isLoading && <div className="text-sm text-slate-500 dark:text-slate-400">{t("health.loading", "Lade...")}</div>}

      {health && (
        <div className="space-y-5">
          <Section title={t("health.general", "Allgemein")}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="text-slate-500 dark:text-slate-400">{t("health.hostname", "Hostname")}</div>
              <div className="text-slate-800 dark:text-slate-200">{health.hostname}</div>
              <div className="text-slate-500 dark:text-slate-400">{t("health.sambaVersion", "Samba-Version")}</div>
              <div className="text-slate-800 dark:text-slate-200">{health.sambaVersion}</div>
              <div className="text-slate-500 dark:text-slate-400">{t("health.uptime", "Laufzeit")}</div>
              <div className="text-slate-800 dark:text-slate-200">{health.uptime}</div>
              <div className="text-slate-500 dark:text-slate-400">{t("health.sambaService", "Samba-AD-DC-Dienst")}</div>
              <div>
                <StatusBadge ok={health.samba.active} okLabel={t("health.active", "Aktiv")} badLabel={t("health.inactive", "Inaktiv")} />
              </div>
              <div className="text-slate-500 dark:text-slate-400">{t("health.timeSync", "Zeitsynchronisation")}</div>
              <div>
                <StatusBadge
                  ok={health.timeSyncActive || !!health.timeSyncNote}
                  okLabel={health.timeSyncService ?? t("health.timeSyncByHost", "Vom Host übernommen")}
                  badLabel={t("health.noTimeSync", "Kein Dienst aktiv")}
                />
              </div>
              {health.timeSyncNote && (
                <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">{health.timeSyncNote}</div>
              )}
            </div>
          </Section>

          <Section title={t("health.disk", "Speicherplatz")}>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1">{t("health.mount", "Einhängepunkt")}</th>
                  <th className="px-2 py-1">{t("health.size", "Größe")}</th>
                  <th className="px-2 py-1">{t("health.used", "Belegt")}</th>
                  <th className="px-2 py-1">{t("health.avail", "Verfügbar")}</th>
                  <th className="px-2 py-1">{t("health.usePercent", "Belegung")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {health.diskUsage.map((d) => (
                  <tr key={d.mount}>
                    <td className="px-2 py-1 font-mono text-xs text-slate-700 dark:text-slate-300">{d.mount}</td>
                    <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{d.sizeGb} GB</td>
                    <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{d.usedGb} GB</td>
                    <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{d.availGb} GB</td>
                    <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{d.usePercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title={t("health.fsmoTitle", "FSMO-Rollen")}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {FSMO_ROLE_ORDER.map(({ key, labelKey }) => (
                <Fragment key={key}>
                  <div className="text-slate-500 dark:text-slate-400">{t(labelKey)}</div>
                  <div className="text-slate-800 dark:text-slate-200">{health.fsmoRoles[key]}</div>
                </Fragment>
              ))}
            </div>
          </Section>

          <Section title={t("health.replicationTitle", "Replikation")}>
            {health.replicationNeighbors.length === 0 ? (
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {t("health.noReplicationPartners", "Keine Replikationspartner (Einzel-DC).")}
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-1">{t("health.direction", "Richtung")}</th>
                    <th className="px-2 py-1">{t("health.sourceDsa", "Quell-DSA")}</th>
                    <th className="px-2 py-1">{t("health.lastSuccess", "Letzter Erfolg")}</th>
                    <th className="px-2 py-1">{t("health.failures", "Fehlversuche")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {health.replicationNeighbors.map((n, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{n.direction}</td>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{n.sourceDsa}</td>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{n.lastSuccess ?? "-"}</td>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">
                        <StatusBadge
                          ok={n.consecutiveFailures === 0}
                          okLabel="0"
                          badLabel={String(n.consecutiveFailures)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title={t("health.sysvolSyncTitle", "SYSVOL-Replikation")}>
            <SyncStatusBlock
              status={health.sysvolSync}
              sourceLabel={t("health.sysvolSyncSource", "Dieser DC hält die PDC-Emulator-Rolle und ist die maßgebliche SYSVOL-Quelle.")}
              unavailableLabel={t("health.sysvolSyncUnavailable", "Noch nicht ermittelt.")}
              okLabel={t("health.sysvolSyncOk", "Synchronisiert")}
              failedLabel={t("health.sysvolSyncFailed", "Fehlgeschlagen")}
              fromLabel={(dc) => t("health.sysvolSyncFrom", "von {{dc}}", { dc })}
            />
          </Section>

          <Section title={t("health.printSyncTitle", "Drucker-Replikation")}>
            <SyncStatusBlock
              status={health.printSync}
              sourceLabel={t(
                "health.printSyncSource",
                "Dieser DC hält die PDC-Emulator-Rolle und ist die maßgebliche Quelle für Druckerwarteschlangen und Treiber-Bibliothek."
              )}
              unavailableLabel={t("health.printSyncUnavailable", "Noch nicht ermittelt.")}
              okLabel={t("health.printSyncOk", "Synchronisiert")}
              failedLabel={t("health.printSyncFailed", "Fehlgeschlagen")}
              fromLabel={(dc) => t("health.printSyncFrom", "von {{dc}}", { dc })}
            />
          </Section>

          <Section title={t("health.dbcheckTitle", "Datenbankprüfung (dbcheck)")}>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-800 dark:text-slate-200">
                {t("health.dbcheckSummary", "{{checked}} Objekte geprüft", { checked: health.dbcheck.objectsChecked })}
              </span>
              <StatusBadge
                ok={health.dbcheck.errorCount === 0}
                okLabel={t("health.noErrors", "Keine Fehler")}
                badLabel={t("health.errorsFound", "{{count}} Fehler", { count: health.dbcheck.errorCount })}
              />
            </div>
            {health.dbcheck.notes.length > 0 && (
              <details className="text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer">{t("health.dbcheckNotes", "{{count}} Hinweise", { count: health.dbcheck.notes.length })}</summary>
                <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                  {health.dbcheck.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section title={t("health.printServer", "Druckserver")}>
            <div className="flex items-center gap-3 text-sm">
              <StatusBadge
                ok={!!printStatusQuery.data?.ready}
                okLabel={t("health.printServerReady", "Eingerichtet")}
                badLabel={t("health.printServerNotReady", "Nicht eingerichtet")}
              />
              {!printStatusQuery.data?.ready && !showPrintSetup && (
                <button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setShowPrintSetup(true)}>
                  {t("health.printServerSetUp", "Einrichten...")}
                </button>
              )}
            </div>
            {showPrintSetup && (
              <PrintServerEnablePanel
                onDone={() => {
                  queryClient.invalidateQueries({ queryKey: ["print-server-status"] });
                  setShowPrintSetup(false);
                }}
              />
            )}
          </Section>

          <Section title={t("health.backupTitle", "Sicherung")}>
            <button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setShowBackup(true)}>
              {t("health.backupOpen", "Sicherungen verwalten...")}
            </button>
          </Section>

          <Section title={t("health.dangerZoneTitle", "Gefahrenzone")}>
            <button className="text-sm text-red-600 hover:underline dark:text-red-400" onClick={() => setShowDemote(true)}>
              {t("health.demoteOpen", "Domain Controller entfernen...")}
            </button>
          </Section>

          <div className="text-right text-xs text-slate-400">
            {t("health.generatedAt", "Stand: {{date}}", { date: new Date(health.generatedAt).toLocaleString() })}
          </div>
        </div>
      )}

      {showBackup && <BackupDialog onClose={() => setShowBackup(false)} />}
      {showDemote && health && (
        <DemoteDialog
          hostname={health.hostname}
          onClose={() => {
            setShowDemote(false);
            queryClient.invalidateQueries({ queryKey: ["server-health"] });
          }}
        />
      )}
    </WindowsDialog>
  );
}
