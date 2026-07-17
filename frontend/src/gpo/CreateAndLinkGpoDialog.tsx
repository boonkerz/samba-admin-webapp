import { useState } from "react";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { useGpoCreateJob } from "./useGpoCreateJob";

/** Mirrors real GPMC's "Gruppenrichtlinienobjekt hier erstellen und verknüpfen..." (right-click an OU). */
export function CreateAndLinkGpoDialog({ targetDn, targetName, onDone }: { targetDn: string; targetName: string; onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const { start, pending } = useGpoCreateJob(onDone);

  const valid = displayName.trim().length > 0;

  function submit() {
    if (valid && !pending) start({ displayName, linkToDn: targetDn });
  }

  return (
    <WindowsDialog
      title="Neues Gruppenrichtlinienobjekt"
      icon={<span className="text-2xl">📋</span>}
      createIn={targetName}
      onClose={pending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || pending} onClick={submit}>
            {pending ? "Wird erstellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" disabled={pending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={pending}
            autoFocus
          />
        </div>
        {pending && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Wird erstellt… Dies kann einige Minuten dauern, da die Berechtigungen im SYSVOL-Verzeichnis aktualisiert werden. Der Vorgang läuft auf
            dem Server weiter, auch wenn dieses Fenster geschlossen wird.
          </p>
        )}
      </div>
    </WindowsDialog>
  );
}
