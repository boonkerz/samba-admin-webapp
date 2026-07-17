import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";

/** Mirrors real DNS-Manager's "Neue Zone" wizard (right-click Forward-/Reverse-Lookupzonen > Neue Zone...). */
export function NewZoneDialog({ defaultReverse, onDone }: { defaultReverse: boolean; onDone: () => void }) {
  const [reverse, setReverse] = useState(defaultReverse);
  const [zoneName, setZoneName] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/dns/zones", { zoneName: zoneName.trim() }),
    onSuccess: () => {
      pushToast("success", "Zone erstellt.");
      queryClient.invalidateQueries({ queryKey: ["dns-zones"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = zoneName.trim().length > 0;

  return (
    <WindowsDialog
      title="Neue Zone"
      onClose={mutation.isPending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" disabled={mutation.isPending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-4 text-sm text-slate-800 dark:text-slate-200">
          <label className="flex items-center gap-2">
            <input type="radio" checked={!reverse} onChange={() => setReverse(false)} />
            Forward-Lookupzone
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={reverse} onChange={() => setReverse(true)} />
            Reverse-Lookupzone
          </label>
        </div>
        <div>
          <WinLabel>Zonenname:</WinLabel>
          <WinInput
            value={zoneName}
            onChange={(e) => setZoneName(e.target.value)}
            placeholder={reverse ? "z. B. 1.168.192.in-addr.arpa" : "z. B. beispiel.local"}
            autoFocus
          />
        </div>
      </div>
    </WindowsDialog>
  );
}
