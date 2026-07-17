import { useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DriverArch, WindowsDriverPackage } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

/** Uploads a Windows driver package (.inf + associated files the admin already has) into this app's own driver store — see driver-upload.service.ts; this does NOT source drivers itself. */
export function DriverUploadDialog({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [arch, setArch] = useState<DriverArch>("x64");
  const [displayName, setDisplayName] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      formData.append("arch", arch);
      if (displayName.trim()) formData.append("displayName", displayName.trim());
      return api.upload<WindowsDriverPackage>("/api/print/drivers/upload", formData);
    },
    onSuccess: (pkg) => {
      pushToast("success", `Treiber "${pkg.displayName}" hochgeladen.`);
      queryClient.invalidateQueries({ queryKey: ["print-drivers"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    setFiles(e.target.files ? Array.from(e.target.files) : []);
  }

  const hasInf = files.some((f) => f.name.toLowerCase().endsWith(".inf"));

  return (
    <WindowsDialog
      title="Treiber hochladen"
      onClose={onDone}
      footer={
        <>
          <WindowsButton variant="primary" disabled={!hasInf || mutation.isPending} onClick={() => mutation.mutate()}>
            Hochladen
          </WindowsButton>
          <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Wähle die .inf-Datei des Treibers zusammen mit allen dazugehörigen Dateien (DLLs, PPD, Hilfedatei usw.) aus. Diese App lädt
          keine Treiber selbst herunter — es müssen bereits vorhandene Windows-Treiberdateien sein.
        </p>
        <div>
          <WinLabel>Treiberdateien (.inf + zugehörige Dateien):</WinLabel>
          <input type="file" multiple onChange={handleFilesChange} className="block w-full text-sm text-slate-700 dark:text-slate-300" />
          {files.length > 0 && !hasInf && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Keine .inf-Datei in der Auswahl gefunden.</p>}
          {files.length > 0 && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{files.length} Datei(en) ausgewählt.</p>}
        </div>
        <div>
          <WinLabel>Architektur:</WinLabel>
          <WinSelect value={arch} onChange={(e) => setArch(e.target.value as DriverArch)}>
            <option value="x64">Windows x64</option>
            <option value="W32X86">Windows NT x86</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Anzeigename (optional):</WinLabel>
          <WinInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="wird sonst aus der INF gelesen" />
        </div>
      </div>
    </WindowsDialog>
  );
}
