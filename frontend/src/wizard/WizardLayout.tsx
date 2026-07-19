import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function WizardLayout({ activeStep, children }: { activeStep: number; children: ReactNode }) {
  const { t } = useTranslation();
  const STEPS = [
    t("wizard.steps.packages", "Pakete"),
    t("wizard.steps.config", "Konfiguration"),
    t("wizard.steps.printServer", "Druckserver"),
    t("wizard.steps.finish", "Fertig"),
  ];

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("wizard.title", "Samba Active Directory Einrichtung")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("wizard.subtitle", "Diesen Server in einen Active Directory Domain Controller umwandeln.")}
        </p>
      </div>

      <ol className="mb-8 flex items-center gap-4">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                index === activeStep
                  ? "bg-indigo-600 text-white"
                  : index < activeStep
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {index < activeStep ? "✓" : index + 1}
            </span>
            <span className={`text-sm ${index === activeStep ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
              {label}
            </span>
            {index < STEPS.length - 1 && <span className="ml-2 h-px w-8 bg-slate-300 dark:bg-slate-600" />}
          </li>
        ))}
      </ol>

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        {children}
      </div>
    </div>
  );
}
