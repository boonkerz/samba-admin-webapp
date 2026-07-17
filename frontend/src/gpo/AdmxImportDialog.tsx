import { useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdmxImportResult } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

/** Imports a third-party ADMX/ADML template bundle (Chrome, Adobe Reader, ...) as a .zip into the domain's Central Store (SYSVOL PolicyDefinitions). Real GPMC has no equivalent wizard in the modern ADMX model — this is a value-add so an admin doesn't have to manually copy files onto SYSVOL over a file share. */
export function AdmxImportDialog({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      return api.upload<AdmxImportResult>("/api/gpo/admx-templates/import", formData);
    },
    onSuccess: (result) => {
      pushToast("success", `${result.admxFilesAdded.length} ADMX-Datei(en) importiert.`);
      queryClient.invalidateQueries({ queryKey: ["gpo-admx-root-categories"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  const isZip = file?.name.toLowerCase().endsWith(".zip") ?? false;

  return (
    <WindowsDialog
      title="Administrative Vorlagen importieren"
      onClose={onDone}
      footer={
        <>
          <WindowsButton variant="primary" disabled={!isZip || mutation.isPending} onClick={() => mutation.mutate()}>
            Importieren
          </WindowsButton>
          <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Lädt ein ZIP-Archiv mit ADMX-/ADML-Vorlagen eines Drittanbieters (z.B. Google Chrome, Adobe Reader) hoch und kopiert alle
          darin gefundenen .admx-/.adml-Dateien in den Zentralspeicher (SYSVOL\PolicyDefinitions) dieser Domäne. Die Ordnerstruktur
          im Archiv spielt keine Rolle — es wird rekursiv nach passenden Dateien gesucht.
        </p>
        <div>
          <input type="file" accept=".zip" onChange={handleFileChange} className="block w-full text-sm text-slate-700 dark:text-slate-300" />
          {file && !isZip && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Bitte eine .zip-Datei auswählen.</p>}
        </div>
      </div>
    </WindowsDialog>
  );
}
