import { useEffect, useState } from "react";
import type { SetupSummary } from "@samba-admin/shared";
import { api } from "../api/client";
import { Button } from "../components/Button";

export function StepFinish({ onContinue }: { onContinue: () => void }) {
  const [summary, setSummary] = useState<SetupSummary>();
  const [rebooting, setRebooting] = useState(false);

  useEffect(() => {
    api.get<SetupSummary>("/api/setup/summary").then(setSummary).catch(() => undefined);
  }, []);

  async function reboot() {
    setRebooting(true);
    await api.post("/api/setup/reboot").catch(() => undefined);
  }

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40">
        ✓
      </div>
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Domäne erfolgreich eingerichtet</h2>
      {summary && (
        <dl className="mx-auto grid max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-left text-sm">
          <dt className="text-slate-500 dark:text-slate-400">Realm</dt>
          <dd className="text-slate-900 dark:text-slate-100">{summary.realm}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Domäne</dt>
          <dd className="text-slate-900 dark:text-slate-100">{summary.domain}</dd>
          <dt className="text-slate-500 dark:text-slate-400">Hostname</dt>
          <dd className="text-slate-900 dark:text-slate-100">{summary.hostname}</dd>
          <dt className="text-slate-500 dark:text-slate-400">IP-Adresse</dt>
          <dd className="text-slate-900 dark:text-slate-100">{summary.ip}</dd>
        </dl>
      )}
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Ein Neustart wird empfohlen, damit alle Dienste sauber in der richtigen Reihenfolge starten.
      </p>
      <div className="flex justify-center gap-3">
        <Button variant="secondary" onClick={reboot} disabled={rebooting}>
          Jetzt neu starten
        </Button>
        <Button onClick={onContinue}>Weiter zur Anmeldung</Button>
      </div>
    </div>
  );
}
