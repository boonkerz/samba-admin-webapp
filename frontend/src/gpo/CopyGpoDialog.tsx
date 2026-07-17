import { useState } from "react";
import type { GpoObject } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { useGpoJob } from "./useGpoJob";

/** Mirrors real GPMC's "Kopieren" (Copy) action — duplicates a GPO's SYSVOL content, DACL, and WMI filter under a new GUID. */
export function CopyGpoDialog({ gpo, onDone }: { gpo: GpoObject; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(`Kopie von ${gpo.displayName}`);
  const { start, pending } = useGpoJob<{ displayName: string }>(`/api/gpo/${gpo.guid}/copy-job`, "Gruppenrichtlinienobjekt kopiert.", onDone);

  const valid = displayName.trim().length > 0;

  return (
    <WindowsDialog
      title="Gruppenrichtlinienobjekt kopieren"
      onClose={pending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || pending} onClick={() => start({ displayName })}>
            {pending ? "Wird kopiert…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" disabled={pending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name der Kopie:</WinLabel>
          <WinInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={pending} autoFocus />
        </div>
        {pending && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Wird kopiert… Dies kann einige Minuten dauern, da die Berechtigungen im SYSVOL-Verzeichnis aktualisiert werden.
          </p>
        )}
      </div>
    </WindowsDialog>
  );
}
