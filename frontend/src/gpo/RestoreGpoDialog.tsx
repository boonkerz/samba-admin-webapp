import { useState } from "react";
import type { GpoBackupManifest } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { useGpoJob } from "./useGpoJob";

/**
 * Mirrors real GPMC's "Wiederherstellen" (Restore) — reads back a manifest produced by our own
 * "Sichern" (Backup) action. Not compatible with real GPMC's Backup.xml/gpreport.xml format.
 */
export function RestoreGpoDialog({ onDone }: { onDone: () => void }) {
  const [manifest, setManifest] = useState<GpoBackupManifest | null>(null);
  const [fileName, setFileName] = useState("");
  const [asNew, setAsNew] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const pushToast = useToastStore((s) => s.push);

  const { start, pending } = useGpoJob<{ manifest: GpoBackupManifest; asNew: boolean; newDisplayName?: string }>(
    "/api/gpo/restore-job",
    "Gruppenrichtlinienobjekt wiederhergestellt.",
    onDone
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as GpoBackupManifest;
      if (parsed.formatVersion !== 1) throw new Error("Unbekanntes Sicherungsformat.");
      setManifest(parsed);
      setNewDisplayName(parsed.displayName);
    } catch (err) {
      pushToast("error", `Ungültige Sicherungsdatei: ${(err as Error).message}`);
      setManifest(null);
    }
  }

  const valid = manifest !== null;

  return (
    <WindowsDialog
      title="Gruppenrichtlinienobjekt wiederherstellen"
      onClose={pending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton
            type="button"
            variant="primary"
            disabled={!valid || pending}
            onClick={() => start({ manifest: manifest!, asNew, newDisplayName: asNew ? newDisplayName : undefined })}
          >
            {pending ? "Wird wiederhergestellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" disabled={pending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Sicherungsdatei:</WinLabel>
          <input type="file" accept=".json" onChange={handleFile} disabled={pending} className="text-sm" />
          {fileName && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{fileName}</p>}
        </div>
        {manifest && (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Enthält: <span className="font-medium text-slate-800 dark:text-slate-200">{manifest.displayName}</span> (gesichert am{" "}
              {new Date(manifest.backedUpAt).toLocaleString("de-DE")})
            </p>
            <WinCheckbox label="Als neues Gruppenrichtlinienobjekt wiederherstellen" checked={asNew} onChange={(e) => setAsNew(e.target.checked)} disabled={pending} />
            {asNew && (
              <div>
                <WinLabel>Name des neuen Objekts:</WinLabel>
                <WinInput value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} disabled={pending} />
              </div>
            )}
          </>
        )}
        {pending && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Wird wiederhergestellt… Dies kann einige Minuten dauern, da die Berechtigungen im SYSVOL-Verzeichnis aktualisiert werden.
          </p>
        )}
      </div>
    </WindowsDialog>
  );
}
