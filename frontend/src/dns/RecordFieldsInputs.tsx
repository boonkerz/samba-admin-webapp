import type { DnsRecordType } from "@samba-admin/shared";
import { WinInput, WinLabel, WinTextarea } from "../components/WindowsDialog";
import type { RecordFieldState } from "./dnsRecordFields";

/** Per-type value fields shared by the create and edit record dialogs. */
export function RecordFieldsInputs({
  type,
  state,
  onChange,
}: {
  type: DnsRecordType;
  state: RecordFieldState;
  onChange: (patch: Partial<RecordFieldState>) => void;
}) {
  return (
    <>
      {(type === "A" || type === "AAAA") && (
        <div>
          <WinLabel>{type === "A" ? "IP-Adresse (IPv4):" : "IP-Adresse (IPv6):"}</WinLabel>
          <WinInput
            value={state.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder={type === "A" ? "192.168.1.10" : "fd00::1"}
          />
        </div>
      )}

      {(type === "CNAME" || type === "NS" || type === "PTR") && (
        <div>
          <WinLabel>Vollqualifizierter Zielname (FQDN):</WinLabel>
          <WinInput value={state.target} onChange={(e) => onChange({ target: e.target.value })} placeholder="ziel.beispiel.local" />
        </div>
      )}

      {type === "MX" && (
        <>
          <div>
            <WinLabel>FQDN des Mailservers:</WinLabel>
            <WinInput value={state.target} onChange={(e) => onChange({ target: e.target.value })} placeholder="mail.beispiel.local" />
          </div>
          <div>
            <WinLabel>Priorität:</WinLabel>
            <WinInput type="number" value={state.preference} onChange={(e) => onChange({ preference: e.target.value })} />
          </div>
        </>
      )}

      {type === "SRV" && (
        <>
          <div>
            <WinLabel>Zielhost:</WinLabel>
            <WinInput value={state.target} onChange={(e) => onChange({ target: e.target.value })} placeholder="host.beispiel.local" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <WinLabel>Port:</WinLabel>
              <WinInput type="number" value={state.port} onChange={(e) => onChange({ port: e.target.value })} />
            </div>
            <div>
              <WinLabel>Priorität:</WinLabel>
              <WinInput type="number" value={state.priority} onChange={(e) => onChange({ priority: e.target.value })} />
            </div>
            <div>
              <WinLabel>Gewichtung:</WinLabel>
              <WinInput type="number" value={state.weight} onChange={(e) => onChange({ weight: e.target.value })} />
            </div>
          </div>
        </>
      )}

      {type === "TXT" && (
        <div>
          <WinLabel>Text (eine Zeichenfolge pro Zeile):</WinLabel>
          <WinTextarea value={state.txtValue} onChange={(e) => onChange({ txtValue: e.target.value })} rows={4} />
        </div>
      )}
    </>
  );
}
