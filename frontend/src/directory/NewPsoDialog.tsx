import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreatePsoRequest } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

const DEFAULTS: CreatePsoRequest = {
  name: "",
  precedence: 10,
  passwordHistoryLength: 24,
  passwordComplexityEnabled: true,
  reversibleEncryptionEnabled: false,
  minimumPasswordLengthChars: 7,
  minimumPasswordAgeDays: 1,
  maximumPasswordAgeDays: 42,
  lockoutThreshold: 0,
  lockoutDurationMinutes: 30,
  lockoutObservationWindowMinutes: 30,
};

/** Mirrors ADAC's "Neue Kennworteinstellungen" dialog — Fine-Grained Password Policy (msDS-PasswordSettings). */
export function NewPsoDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<CreatePsoRequest>(DEFAULTS);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  function set<K extends keyof CreatePsoRequest>(key: K, value: CreatePsoRequest[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const mutation = useMutation({
    mutationFn: () => api.post("/api/directory/psos", form),
    onSuccess: () => {
      pushToast("success", "Kennworteinstellungen erstellt.");
      queryClient.invalidateQueries({ queryKey: ["psos"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = form.name.trim().length > 0;

  return (
    <WindowsDialog
      title="Neue Kennworteinstellungen"
      onClose={mutation.isPending ? () => {} : onDone}
      maxWidthClassName="max-w-xl"
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "Speichern"}
          </WindowsButton>
          <WindowsButton type="button" disabled={mutation.isPending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <WinLabel>Name:</WinLabel>
            <WinInput value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </div>
          <div className="w-32">
            <WinLabel>Präzedenz:</WinLabel>
            <WinInput type="number" value={form.precedence} onChange={(e) => set("precedence", Number(e.target.value))} />
          </div>
        </div>
        <div className="h-px bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Minimale Kennwortlänge:</WinLabel>
            <WinInput type="number" value={form.minimumPasswordLengthChars} onChange={(e) => set("minimumPasswordLengthChars", Number(e.target.value))} />
          </div>
          <div>
            <WinLabel>Kennwortchronik (Anzahl):</WinLabel>
            <WinInput type="number" value={form.passwordHistoryLength} onChange={(e) => set("passwordHistoryLength", Number(e.target.value))} />
          </div>
          <div>
            <WinLabel>Minimales Kennwortalter (Tage):</WinLabel>
            <WinInput type="number" value={form.minimumPasswordAgeDays} onChange={(e) => set("minimumPasswordAgeDays", Number(e.target.value))} />
          </div>
          <div>
            <WinLabel>Maximales Kennwortalter (Tage):</WinLabel>
            <WinInput type="number" value={form.maximumPasswordAgeDays} onChange={(e) => set("maximumPasswordAgeDays", Number(e.target.value))} />
          </div>
        </div>
        <WinCheckbox
          label="Kennwort muss Komplexitätsvoraussetzungen entsprechen"
          checked={form.passwordComplexityEnabled}
          onChange={(e) => set("passwordComplexityEnabled", e.target.checked)}
        />
        <WinCheckbox
          label="Kennwort mit umkehrbarer Verschlüsselung speichern"
          checked={form.reversibleEncryptionEnabled}
          onChange={(e) => set("reversibleEncryptionEnabled", e.target.checked)}
        />
        <div className="h-px bg-slate-200 dark:bg-slate-700" />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <WinLabel>Kontosperrungsschwelle:</WinLabel>
            <WinInput type="number" value={form.lockoutThreshold} onChange={(e) => set("lockoutThreshold", Number(e.target.value))} />
          </div>
          <div>
            <WinLabel>Sperrdauer (Min.):</WinLabel>
            <WinInput
              type="number"
              value={form.lockoutDurationMinutes}
              onChange={(e) => set("lockoutDurationMinutes", Number(e.target.value))}
              disabled={form.lockoutThreshold === 0}
            />
          </div>
          <div>
            <WinLabel>Zurücksetzungsintervall (Min.):</WinLabel>
            <WinInput
              type="number"
              value={form.lockoutObservationWindowMinutes}
              onChange={(e) => set("lockoutObservationWindowMinutes", Number(e.target.value))}
              disabled={form.lockoutThreshold === 0}
            />
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}
