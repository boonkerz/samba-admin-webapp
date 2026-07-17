import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GpoObject, VpnConnectionPreference, DunConnectionPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

const ACTION_OPTIONS = [
  { value: "C", label: "Erstellen" },
  { value: "R", label: "Ersetzen" },
  { value: "U", label: "Aktualisieren" },
  { value: "D", label: "Löschen" },
];

function useSaveNetworkOptions(gpo: GpoObject, uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid ? api.put(`/api/gpo/${gpo.guid}/networkoptions/${uid}`, body) : api.post(`/api/gpo/${gpo.guid}/networkoptions`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Netzwerkverbindung aktualisiert." : "Netzwerkverbindung erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Eigenschaften für VPN-Verbindung" dialog. */
export function VpnConnectionDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: VpnConnectionPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<VpnConnectionPreference["action"]>(item?.action ?? "U");
  const [allUsers, setAllUsers] = useState(item?.allUsers ?? false);
  const [name, setName] = useState(item?.name ?? "");
  const [ipAddress, setIpAddress] = useState(item?.ipAddress ?? "");
  const [useDNS, setUseDNS] = useState(item?.useDNS ?? false);
  const [trayIcon, setTrayIcon] = useState(item?.trayIcon ?? true);
  const [showProgress, setShowProgress] = useState(item?.showProgress ?? true);
  const [showPassword, setShowPassword] = useState(item?.showPassword ?? false);
  const [showDomain, setShowDomain] = useState(item?.showDomain ?? true);
  const [redialCount, setRedialCount] = useState(item?.redialCount ?? 0);
  const [reconnect, setReconnect] = useState(item?.reconnect ?? false);
  const [vpnStrategy, setVpnStrategy] = useState<VpnConnectionPreference["vpnStrategy"]>(item?.vpnStrategy ?? "VS_Automatic");
  const saveMutation = useSaveNetworkOptions(gpo, item?.uid, onSaved);

  const valid = name.trim().length > 0 && ipAddress.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für VPN-Verbindung" : "Neue Eigenschaften für VPN-Verbindung"}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                kind: "vpn",
                action,
                allUsers,
                name,
                ipAddress,
                useDNS,
                trayIcon,
                showProgress,
                showPassword,
                showDomain,
                redialCount,
                reconnect,
                customSettings: false,
                securePassword: false,
                secureData: false,
                useLogon: false,
                vpnStrategy,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as VpnConnectionPreference["action"])}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <WinCheckbox label="Für alle Benutzer verfügbar" checked={allUsers} onChange={(e) => setAllUsers(e.target.checked)} />
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Hostname oder IP-Adresse:</WinLabel>
          <WinInput value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="10.10.10.50" />
        </div>
        <div>
          <WinLabel>VPN-Typ:</WinLabel>
          <WinSelect value={vpnStrategy} onChange={(e) => setVpnStrategy(e.target.value as VpnConnectionPreference["vpnStrategy"])}>
            <option value="VS_Automatic">Automatisch</option>
            <option value="VS_PptpOnly">Nur PPTP</option>
            <option value="VS_L2tpOnly">Nur L2TP/IPsec</option>
            <option value="VS_SstpOnly">Nur SSTP</option>
            <option value="VS_IkeV2Only">Nur IKEv2</option>
          </WinSelect>
        </div>
        <WinCheckbox label="DNS-Namen für Verbindung verwenden" checked={useDNS} onChange={(e) => setUseDNS(e.target.checked)} />
        <WinCheckbox label="Symbol im Infobereich anzeigen" checked={trayIcon} onChange={(e) => setTrayIcon(e.target.checked)} />
        <WinCheckbox label="Fortschritt beim Verbinden anzeigen" checked={showProgress} onChange={(e) => setShowProgress(e.target.checked)} />
        <WinCheckbox label="Kennwort anzeigen" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        <WinCheckbox label="Domäne anzeigen" checked={showDomain} onChange={(e) => setShowDomain(e.target.checked)} />
        <WinCheckbox label="Bei Verbindungsabbruch erneut verbinden" checked={reconnect} onChange={(e) => setReconnect(e.target.checked)} />
        <div>
          <WinLabel>Anzahl Wahlwiederholungen:</WinLabel>
          <WinInput type="number" min={0} value={redialCount} onChange={(e) => setRedialCount(Number(e.target.value) || 0)} />
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Eigenschaften für DFÜ-Verbindung" dialog. */
export function DunConnectionDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: DunConnectionPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<DunConnectionPreference["action"]>(item?.action ?? "U");
  const [allUsers, setAllUsers] = useState(item?.allUsers ?? false);
  const [name, setName] = useState(item?.name ?? "");
  const [phoneNumber, setPhoneNumber] = useState(item?.phoneNumber ?? "");
  const saveMutation = useSaveNetworkOptions(gpo, item?.uid, onSaved);

  const valid = name.trim().length > 0 && phoneNumber.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für DFÜ-Verbindung" : "Neue Eigenschaften für DFÜ-Verbindung"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ kind: "dun", action, allUsers, name, phoneNumber })}
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as DunConnectionPreference["action"])}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <WinCheckbox label="Für alle Benutzer verfügbar" checked={allUsers} onChange={(e) => setAllUsers(e.target.checked)} />
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Telefonnummer:</WinLabel>
          <WinInput value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="1-555-1212" />
        </div>
      </div>
    </WindowsDialog>
  );
}
