import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CupsPrinterSummary, UpdateCupsPrinterRequest, WindowsDriverPackage } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox, type WinTab } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { DriverUploadDialog } from "./DriverUploadDialog";

const TABS: WinTab[] = [
  { id: "general", label: "Allgemein" },
  { id: "driver", label: "Treiber" },
];

/** Mirrors a real printer's Properties dialog — General tab (device/location/shared) + a Driver tab distinct from any CUPS-side PPD concern (see shared/src/types/print.ts). */
export function PrinterPropertiesDialog({
  printer,
  drivers,
  onDone,
}: {
  printer: CupsPrinterSummary;
  drivers: WindowsDriverPackage[];
  onDone: () => void;
}) {
  const [tab, setTab] = useState("general");
  const [deviceUri, setDeviceUri] = useState(printer.deviceUri);
  const [location, setLocation] = useState(printer.location ?? "");
  const [comment, setComment] = useState(printer.comment ?? "");
  const [shared, setShared] = useState(printer.shared);
  const [selectedDriverId, setSelectedDriverId] = useState(printer.driverId ?? "");
  const [showUpload, setShowUpload] = useState(false);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const driversQuery = useQuery({
    queryKey: ["print-drivers"],
    queryFn: () => api.get<WindowsDriverPackage[]>("/api/print/drivers"),
    initialData: drivers,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: UpdateCupsPrinterRequest = { deviceUri, location, comment, shared };
      return api.put(`/api/print/printers/${encodeURIComponent(printer.name)}`, body);
    },
    onSuccess: () => {
      pushToast("success", "Drucker aktualisiert.");
      queryClient.invalidateQueries({ queryKey: ["print-printers"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const assignDriverMutation = useMutation({
    mutationFn: () => api.post(`/api/print/printers/${encodeURIComponent(printer.name)}/driver`, { driverId: selectedDriverId }),
    onSuccess: () => {
      pushToast("success", "Treiber zugewiesen.");
      queryClient.invalidateQueries({ queryKey: ["print-printers"] });
      queryClient.invalidateQueries({ queryKey: ["print-drivers"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <WindowsDialog
      title={`Eigenschaften: ${printer.name}`}
      onClose={onDone}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      footer={
        tab === "general" ? (
          <>
            <WindowsButton variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              OK
            </WindowsButton>
            <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
          </>
        ) : (
          <WindowsButton onClick={onDone}>Schließen</WindowsButton>
        )
      }
    >
      {tab === "general" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Gerätepfad (URI):</WinLabel>
            <WinInput value={deviceUri} onChange={(e) => setDeviceUri(e.target.value)} />
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
      )}

      {tab === "driver" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ordnet diesem Drucker einen hochgeladenen Windows-Treiber zu, damit Windows-Clients ihn per Point-and-Print automatisch
            installieren.
          </p>
          <div>
            <WinLabel>Windows-Treiber:</WinLabel>
            <WinSelect value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}>
              <option value="">Kein Treiber</option>
              {(driversQuery.data ?? []).map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.displayName} ({d.arch})
                </option>
              ))}
            </WinSelect>
          </div>
          <div className="flex gap-2">
            <WindowsButton variant="primary" disabled={!selectedDriverId || assignDriverMutation.isPending} onClick={() => assignDriverMutation.mutate()}>
              Zuweisen
            </WindowsButton>
            <WindowsButton onClick={() => setShowUpload(true)}>Treiber hochladen...</WindowsButton>
          </div>
        </div>
      )}

      {showUpload && (
        <DriverUploadDialog
          onDone={() => {
            setShowUpload(false);
            queryClient.invalidateQueries({ queryKey: ["print-drivers"] });
          }}
        />
      )}
    </WindowsDialog>
  );
}
