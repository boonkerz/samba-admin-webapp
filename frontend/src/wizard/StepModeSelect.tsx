/** Mirrors the "Deployment Configuration" screen of Windows Server's AD DS Configuration Wizard — the fork between creating a brand-new forest/domain, joining this (fresh, unprovisioned) server to an existing one as an additional domain controller, or rebuilding a domain from a backup after total loss. */
export function StepModeSelect({ onSelect }: { onSelect: (mode: "provision" | "join" | "restore") => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Bereitstellungskonfiguration</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">Wähle, wozu dieser Server eingerichtet werden soll.</p>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onSelect("provision")}
          className="block w-full rounded-lg border border-slate-300 p-4 text-left hover:border-indigo-500 hover:bg-indigo-50 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
        >
          <p className="font-medium text-slate-900 dark:text-slate-100">Neue Gesamtstruktur erstellen</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Dieser Server wird der erste Domain Controller einer neuen Active-Directory-Domäne.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelect("join")}
          className="block w-full rounded-lg border border-slate-300 p-4 text-left hover:border-indigo-500 hover:bg-indigo-50 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
        >
          <p className="font-medium text-slate-900 dark:text-slate-100">Diesen Server einer bestehenden Domäne hinzufügen</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Dieser Server wird als zusätzlicher Domain Controller einer bereits vorhandenen Domäne beitreten (Replikation).
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelect("restore")}
          className="block w-full rounded-lg border border-slate-300 p-4 text-left hover:border-indigo-500 hover:bg-indigo-50 dark:border-slate-600 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
        >
          <p className="font-medium text-slate-900 dark:text-slate-100">Aus Sicherung wiederherstellen</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Baut eine Domäne aus einer zuvor erstellten Sicherung (samba-tool domain backup) neu auf — für den Fall eines vollständigen
            Ausfalls aller Domain Controller.
          </p>
        </button>
      </div>
    </div>
  );
}
