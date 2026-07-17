import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CupsPrinterSummary,
  GpoObject,
  PrintServerStatus,
  SharedPrinterPreference,
  LocalPrinterPreference,
  TcpIpPrinterPreference,
} from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

const ACTION_OPTIONS = [
  { value: "C", label: "Erstellen" },
  { value: "R", label: "Ersetzen" },
  { value: "U", label: "Aktualisieren" },
  { value: "D", label: "Löschen" },
];

type Action = "C" | "R" | "U" | "D";

/** Pulls the host/IP out of a CUPS device URI like `socket://192.168.1.50:9100` or `lpd://printserver/queue`. */
function extractHostFromDeviceUri(deviceUri: string): string | undefined {
  try {
    return new URL(deviceUri).hostname || undefined;
  } catch {
    return undefined;
  }
}

/** Real network printers are just as often referenced by hostname (e.g. `lpd://wlansekretariat/...`) as by literal IP. */
function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function useSavePrinter(gpo: GpoObject, uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid ? api.put(`/api/gpo/${gpo.guid}/printers/${uid}`, body) : api.post(`/api/gpo/${gpo.guid}/printers`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Druckerverbindung aktualisiert." : "Druckerverbindung erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Neue/Eigenschaften für freigegebene Drucker" dialog. */
export function SharedPrinterDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: SharedPrinterPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<Action>(item?.action ?? "C");
  const [path, setPath] = useState(item?.path ?? "");
  const [isDefault, setIsDefault] = useState(item?.default ?? false);
  const [skipLocal, setSkipLocal] = useState(item?.skipLocal ?? false);
  const [deleteAll, setDeleteAll] = useState(item?.deleteAll ?? false);
  const [port, setPort] = useState(item?.port ?? "");
  const [persistent, setPersistent] = useState(item?.persistent ?? false);
  const [deleteMaps, setDeleteMaps] = useState(item?.deleteMaps ?? false);
  const [useSuggestion, setUseSuggestion] = useState(false);
  const saveMutation = useSavePrinter(gpo, item?.uid, onSaved);

  // Optional convenience: offer a dropdown of printers this app already
  // knows about (real hosted CUPS/Samba printers) alongside the free-text
  // path — purely a frontend nicety, doesn't change how the path is stored
  // or interpreted (still a plain opaque UNC string either way).
  const printServerStatusQuery = useQuery({
    queryKey: ["print-server-status"],
    queryFn: () => api.get<PrintServerStatus>("/api/print-server/status"),
  });
  const printersQuery = useQuery({
    queryKey: ["print-printers"],
    queryFn: () => api.get<CupsPrinterSummary[]>("/api/print/printers"),
    enabled: !!printServerStatusQuery.data?.ready,
  });
  const hostname = printServerStatusQuery.data?.hostname;
  const suggestedPrinters = hostname ? (printersQuery.data ?? []) : [];

  const valid = path.trim().startsWith("\\\\");

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für freigegebene Drucker" : "Neue Eigenschaften für freigegebene Drucker"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                connectionType: "shared",
                action,
                path,
                default: isDefault,
                skipLocal,
                deleteAll,
                port: port || undefined,
                persistent,
                deleteMaps,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as Action)}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <WinCheckbox
          label="Alle freigegebenen Druckerverbindungen löschen"
          checked={deleteAll}
          disabled={action !== "D"}
          onChange={(e) => setDeleteAll(e.target.checked)}
        />

        <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
          <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Freigegebener Drucker</legend>
          <div className="space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <WinLabel>Freigabepfad:</WinLabel>
                {suggestedPrinters.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                    onClick={() => setUseSuggestion((v) => !v)}
                  >
                    {useSuggestion ? "Manuell eingeben" : "Aus vorhandenen Druckern wählen"}
                  </button>
                )}
              </div>
              {useSuggestion && suggestedPrinters.length > 0 ? (
                <WinSelect value={path} onChange={(e) => setPath(e.target.value)}>
                  <option value="">Bitte wählen...</option>
                  {suggestedPrinters.map((p) => (
                    <option key={p.name} value={`\\\\${hostname}\\${p.name}`}>
                      {p.name} (\\{hostname}\{p.name})
                    </option>
                  ))}
                </WinSelect>
              ) : (
                <WinInput value={path} onChange={(e) => setPath(e.target.value)} placeholder="\\\\server\\drucker" autoFocus />
              )}
            </div>
            <WinCheckbox
              label="Drucker als Standarddrucker festlegen..."
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <div className="pl-6">
              <WinCheckbox
                label="...sofern kein lokaler Drucker vorhanden ist"
                checked={skipLocal}
                disabled={!isDefault}
                onChange={(e) => setSkipLocal(e.target.checked)}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
          <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Zu lokalem Port zuordnen (optional)</legend>
          <div className="space-y-2">
            <div>
              <WinLabel>Lokaler Port:</WinLabel>
              <WinInput value={port} onChange={(e) => setPort(e.target.value)} placeholder="LPT1:" />
            </div>
            <WinCheckbox label="Verbindung wiederherstellen" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />
            <WinCheckbox
              label="Zuordnung aller lokalen Ports aufheben"
              checked={deleteMaps}
              onChange={(e) => setDeleteMaps(e.target.checked)}
            />
          </div>
        </fieldset>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Neue/Eigenschaften für lokale Drucker" dialog. */
export function LocalPrinterDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: LocalPrinterPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<Action>(item?.action ?? "C");
  const [name, setName] = useState(item?.name ?? "");
  const [port, setPort] = useState(item?.port ?? "");
  const [driverPath, setDriverPath] = useState(item?.path ?? "");
  const [isDefault, setIsDefault] = useState(item?.default ?? false);
  const [location, setLocation] = useState(item?.location ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const saveMutation = useSavePrinter(gpo, item?.uid, onSaved);

  const valid = name.trim().length > 0 && port.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für lokale Drucker" : "Neue Eigenschaften für lokale Drucker"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                connectionType: "local",
                action,
                name,
                port,
                path: driverPath,
                default: isDefault,
                location: location || undefined,
                comment: comment || undefined,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as Action)}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Port:</WinLabel>
          <WinInput value={port} onChange={(e) => setPort(e.target.value)} placeholder="LPT1:" />
        </div>
        <div>
          <WinLabel>Druckerpfad:</WinLabel>
          <WinInput value={driverPath} onChange={(e) => setDriverPath(e.target.value)} />
        </div>
        <WinCheckbox label="Drucker als Standarddrucker festlegen" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        <div>
          <WinLabel>Standort:</WinLabel>
          <WinInput value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <WinLabel>Kommentar:</WinLabel>
          <WinInput value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Neue TCP/IP-Druckereigenschaften" dialog. */
export function TcpIpPrinterDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: TcpIpPrinterPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<Action>(item?.action ?? "C");
  const [deleteAll, setDeleteAll] = useState(item?.deleteAll ?? false);
  const [ipAddress, setIpAddress] = useState(item?.ipAddress ?? "");
  const [useDNS, setUseDNS] = useState(item?.useDNS ?? false);
  const [localName, setLocalName] = useState(item?.localName ?? "");
  const [driverPath, setDriverPath] = useState(item?.path ?? "");
  const [isDefault, setIsDefault] = useState(item?.default ?? false);
  const [skipLocal, setSkipLocal] = useState(item?.skipLocal ?? false);
  const [location, setLocation] = useState(item?.location ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const [useSuggestion, setUseSuggestion] = useState(false);
  const saveMutation = useSavePrinter(gpo, item?.uid, onSaved);

  // Same convenience as the shared-printer dialog: offer a dropdown of
  // printers this app already knows about. Here a selection fills both
  // "IP-Adresse" (parsed from the printer's device URI) and "Lokaler Name"
  // — still just prefills plain fields, doesn't change how the connection
  // is stored/interpreted.
  const printServerStatusQuery = useQuery({
    queryKey: ["print-server-status"],
    queryFn: () => api.get<PrintServerStatus>("/api/print-server/status"),
  });
  const printersQuery = useQuery({
    queryKey: ["print-printers"],
    queryFn: () => api.get<CupsPrinterSummary[]>("/api/print/printers"),
    enabled: !!printServerStatusQuery.data?.ready,
  });
  const suggestedPrinters = (printersQuery.data ?? []).filter((p) => extractHostFromDeviceUri(p.deviceUri));

  async function selectSuggestedPrinter(printerName: string) {
    const printer = suggestedPrinters.find((p) => p.name === printerName);
    if (!printer) return;
    setLocalName(printer.name);

    const host = extractHostFromDeviceUri(printer.deviceUri);
    if (!host) return;

    if (isIpAddress(host)) {
      setIpAddress(host);
      setUseDNS(false);
      return;
    }

    // The extracted value is a hostname (e.g. from an lpd://wlansekretariat/...
    // URI) — browsers can't resolve DNS themselves, so ask the backend for
    // the actual IP. Best-effort: if resolution fails (NetBIOS-only name,
    // no DNS record), fall back to the hostname with "DNS-Name verwenden".
    try {
      const { ip } = await api.get<{ ip: string | null }>(`/api/print/discovery/resolve-host?host=${encodeURIComponent(host)}`);
      if (ip) {
        setIpAddress(ip);
        setUseDNS(false);
        return;
      }
    } catch {
      // fall through to the hostname/DNS-name fallback below
    }
    setIpAddress(host);
    setUseDNS(true);
  }

  const valid = ipAddress.trim().length > 0 && localName.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "TCP/IP-Druckereigenschaften" : "Neue TCP/IP-Druckereigenschaften"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                connectionType: "tcpip",
                action,
                deleteAll,
                ipAddress,
                useDNS,
                localName,
                path: driverPath,
                default: isDefault,
                skipLocal,
                location: location || undefined,
                comment: comment || undefined,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as Action)}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <WinCheckbox
          label="Alle IP-Druckerverbindungen löschen"
          checked={deleteAll}
          disabled={action !== "D"}
          onChange={(e) => setDeleteAll(e.target.checked)}
        />
        {suggestedPrinters.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <WinLabel>Vorschlag:</WinLabel>
              <button
                type="button"
                className="text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                onClick={() => setUseSuggestion((v) => !v)}
              >
                {useSuggestion ? "Manuell eingeben" : "Aus vorhandenen Druckern wählen"}
              </button>
            </div>
            {useSuggestion && (
              <WinSelect defaultValue="" onChange={(e) => e.target.value && selectSuggestedPrinter(e.target.value)}>
                <option value="">Bitte wählen...</option>
                {suggestedPrinters.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({extractHostFromDeviceUri(p.deviceUri)})
                  </option>
                ))}
              </WinSelect>
            )}
          </div>
        )}
        <div>
          <WinLabel>IP-Adresse:</WinLabel>
          <WinInput value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="0.0.0.0" autoFocus />
        </div>
        <WinCheckbox label="DNS-Name verwenden" checked={useDNS} onChange={(e) => setUseDNS(e.target.checked)} />
        <div>
          <WinLabel>Lokaler Name:</WinLabel>
          <WinInput value={localName} onChange={(e) => setLocalName(e.target.value)} />
        </div>
        <div>
          <WinLabel>Druckerpfad:</WinLabel>
          <WinInput value={driverPath} onChange={(e) => setDriverPath(e.target.value)} />
        </div>
        <WinCheckbox
          label="Drucker als Standarddrucker festlegen..."
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <div className="pl-6">
          <WinCheckbox
            label="...sofern kein lokaler Drucker vorhanden ist"
            checked={skipLocal}
            disabled={!isDefault}
            onChange={(e) => setSkipLocal(e.target.checked)}
          />
        </div>
        <div>
          <WinLabel>Standort:</WinLabel>
          <WinInput value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <WinLabel>Kommentar:</WinLabel>
          <WinInput value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </div>
    </WindowsDialog>
  );
}
