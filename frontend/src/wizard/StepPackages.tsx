import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DnsBackend, PreflightResponse } from "@samba-admin/shared";
import { api } from "../api/client";
import { useJobStream } from "../api/useJobStream";
import { Button } from "../components/Button";
import { Select, Field } from "../components/Field";
import { LogConsole } from "../components/LogConsole";
import { Spinner } from "../components/Spinner";

export function StepPackages({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [preflight, setPreflight] = useState<PreflightResponse>();
  const [loading, setLoading] = useState(true);
  const [dnsBackend, setDnsBackend] = useState<DnsBackend>("SAMBA_INTERNAL");
  const [jobId, setJobId] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const stream = useJobStream(jobId);

  const loadPreflight = () => {
    setLoading(true);
    api
      .get<PreflightResponse>("/api/setup/preflight")
      .then(setPreflight)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadPreflight, []);

  useEffect(() => {
    if (stream.status === "succeeded") onDone();
  }, [stream.status]);

  // time-sync and firewall are advisory-only: chrony is installed by this very
  // step (so it's always "not ok" beforehand), and the firewall check is just
  // a heads-up about ports to open, not something that blocks provisioning.
  const BLOCKING_CHECK_IDS = new Set(["port53-conflict", "hostname-fqdn"]);
  const failingChecks = preflight?.checks.filter((c) => !c.ok) ?? [];
  const blockingIssues = failingChecks.filter((c) => BLOCKING_CHECK_IDS.has(c.id));
  const fixableIds = failingChecks.filter((c) => c.fixAvailable).map((c) => c.id);

  async function applyFixes() {
    setLoading(true);
    try {
      setPreflight(await api.post("/api/setup/preflight/fix", { actions: fixableIds }));
    } finally {
      setLoading(false);
    }
  }

  async function startInstall() {
    setStarting(true);
    setError(undefined);
    try {
      const { jobId } = await api.post<{ jobId: string }>("/api/setup/packages/install", { dnsBackend });
      setJobId(jobId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (jobId) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t("wizard.packages.installing", "Pakete werden installiert…")}</h2>
        <LogConsole lines={stream.lines} />
        {stream.status === "failed" && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {t("wizard.packages.installFailed", "Installation fehlgeschlagen (Exit-Code {{code}}). Bitte Log prüfen.", { code: stream.exitCode })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
        {t("wizard.packages.title", "System prüfen & Pakete installieren")}
      </h2>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="h-4 w-4" /> {t("wizard.packages.checking", "Prüfe System…")}
        </div>
      )}

      {!loading && !preflight && error && (
        <div className="space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="secondary" onClick={loadPreflight}>
            {t("wizard.packages.retry", "Erneut versuchen")}
          </Button>
        </div>
      )}

      {preflight && !loading && (
        <>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {t("wizard.packages.detectedLabel", "Erkannt:")}{" "}
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {preflight.distro} {preflight.distroVersion}
            </span>
            , {t("wizard.packages.hostnameLabel", "Hostname")}{" "}
            <span className="font-medium text-slate-900 dark:text-slate-100">{preflight.hostname}</span>
          </div>

          <ul className="divide-y divide-slate-200 rounded-md ring-1 ring-slate-200 dark:divide-slate-700 dark:ring-slate-700">
            {preflight.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span className={check.ok ? "text-emerald-600" : "text-amber-600"}>{check.ok ? "✓" : "!"}</span>
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{check.label}</p>
                  <p className="whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          {fixableIds.length > 0 && (
            <Button variant="secondary" onClick={applyFixes}>
              {t("wizard.packages.autoFix", "Probleme automatisch beheben")}
            </Button>
          )}

          <Field label={t("wizard.packages.dnsBackend", "DNS-Backend")}>
            <Select value={dnsBackend} onChange={(e) => setDnsBackend(e.target.value as DnsBackend)}>
              <option value="SAMBA_INTERNAL">{t("wizard.packages.dnsInternal", "Samba interner DNS-Server (empfohlen)")}</option>
              <option value="BIND9_DLZ">{t("wizard.packages.dnsBind9", "BIND9 mit DLZ-Integration")}</option>
            </Select>
          </Field>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end">
            <Button onClick={startInstall} disabled={starting || blockingIssues.some((c) => !c.fixAvailable)}>
              {starting && <Spinner className="h-4 w-4" />} {t("wizard.packages.install", "Pakete installieren")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
