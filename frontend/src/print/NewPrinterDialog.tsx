import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateCupsPrinterRequest, DeviceUriOption } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

/** Mirrors real Print Management's "Drucker hinzufügen" wizard, simplified to a single dialog (network/IP printers only — this app has no path to a local USB device). */
export function NewPrinterDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [deviceUri, setDeviceUri] = useState("");
  const [useSuggestion, setUseSuggestion] = useState(false);
  const [location, setLocation] = useState("");
  const [comment, setComment] = useState("");
  const [shared, setShared] = useState(true);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const suggestionsQuery = useQuery({
    queryKey: ["print-device-uris"],
    queryFn: () => api.get<DeviceUriOption[]>("/api/print/discovery/device-uris"),
    enabled: useSuggestion,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body: CreateCupsPrinterRequest = { name: name.trim(), deviceUri: deviceUri.trim(), location, comment, shared };
      return api.post("/api/print/printers", body);
    },
    onSuccess: () => {
      pushToast("success", "Drucker erstellt.");
      queryClient.invalidateQueries({ queryKey: ["print-printers"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = /^[A-Za-z0-9_-]+$/.test(name.trim()) && deviceUri.trim().length > 0;

  return (
    <WindowsDialog
      title="Neuer Drucker"
      onClose={onDone}
      footer={
        <>
          <WindowsButton variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} placeholder="buero-og1" autoFocus />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <WinLabel>Gerätepfad (URI):</WinLabel>
            <button type="button" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setUseSuggestion((v) => !v)}>
              {useSuggestion ? "Manuell eingeben" : "Aus Vorschlägen wählen"}
            </button>
          </div>
          {useSuggestion ? (
            <WinSelect value={deviceUri} onChange={(e) => setDeviceUri(e.target.value)}>
              <option value="">Bitte wählen...</option>
              {(suggestionsQuery.data ?? []).map((o) => (
                <option key={o.uri} value={o.uri}>
                  {o.description}
                </option>
              ))}
            </WinSelect>
          ) : (
            <WinInput value={deviceUri} onChange={(e) => setDeviceUri(e.target.value)} placeholder="socket://192.168.1.50:9100" />
          )}
        </div>
        <div>
          <WinLabel>Standort:</WinLabel>
          <WinInput value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <WinLabel>Kommentar:</WinLabel>
          <WinInput value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <WinCheckbox label="Freigeben" checked={shared} onChange={(e) => setShared(e.target.checked)} />
      </div>
    </WindowsDialog>
  );
}
