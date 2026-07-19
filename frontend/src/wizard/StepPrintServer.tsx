import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { PrintServerEnablePanel } from "../print/PrintServerEnablePanel";

/** Opt-in wizard step: unchecked by default, explicitly skippable — this app must not force CUPS/print-serving onto every install. */
export function StepPrintServer({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [wantsPrintServer, setWantsPrintServer] = useState(false);
  const [started, setStarted] = useState(false);

  if (started) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t("wizard.printServer.setupTitle", "Druckserver einrichten")}</h2>
        <PrintServerEnablePanel onDone={onDone} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t("wizard.printServer.title", "Druckserver (optional)")}</h2>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-400"
          checked={wantsPrintServer}
          onChange={(e) => setWantsPrintServer(e.target.checked)}
        />
        <span className="text-slate-700 dark:text-slate-300">
          {t("wizard.printServer.descriptionBefore", "Diesen Server auch als Druckserver einrichten (CUPS installieren, Druckerfreigaben ")}
          <code>[printers]</code>/<code>[print$]</code>
          {t(
            "wizard.printServer.descriptionAfter",
            ' aktivieren)? Dies lässt sich jederzeit später auch über den neuen "Drucker"-Reiter nachholen.'
          )}
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          {t("wizard.printServer.skip", "Überspringen")}
        </Button>
        <Button disabled={!wantsPrintServer} onClick={() => setStarted(true)}>
          {t("wizard.printServer.setUp", "Einrichten")}
        </Button>
      </div>
    </div>
  );
}
