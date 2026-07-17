import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GpoObject, RegistryPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinTextarea } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

const ACTION_OPTIONS = [
  { value: "C", label: "Erstellen" },
  { value: "R", label: "Ersetzen" },
  { value: "U", label: "Aktualisieren" },
  { value: "D", label: "Löschen" },
];

// Real GPME only offers the hive that matches the config side being edited
// (Computer Configuration -> HKLM, User Configuration -> HKCU) plus the two
// hives that are valid from either side.
const HIVE_OPTIONS_BY_SCOPE: Record<"machine" | "user", RegistryPreference["hive"][]> = {
  machine: ["HKEY_LOCAL_MACHINE", "HKEY_CLASSES_ROOT", "HKEY_USERS", "HKEY_CURRENT_CONFIG"],
  user: ["HKEY_CURRENT_USER", "HKEY_CLASSES_ROOT", "HKEY_USERS"],
};

const TYPE_OPTIONS: RegistryPreference["valueType"][] = ["REG_SZ", "REG_EXPAND_SZ", "REG_BINARY", "REG_DWORD", "REG_MULTI_SZ", "REG_QWORD"];

function useSaveRegistry(gpo: GpoObject, scope: "machine" | "user", uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid
        ? api.put(`/api/gpo/${gpo.guid}/registry/${scope}/${uid}`, body)
        : api.post(`/api/gpo/${gpo.guid}/registry/${scope}`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Registrierungselement aktualisiert." : "Registrierungselement erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Neue Eigenschaften für Registrierung" dialog. */
export function RegistryPreferenceDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: RegistryPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<RegistryPreference["action"]>(item?.action ?? "U");
  const [hive, setHive] = useState<RegistryPreference["hive"]>(item?.hive ?? HIVE_OPTIONS_BY_SCOPE[scope][0]);
  const [key, setKey] = useState(item?.key ?? "");
  const [valueName, setValueName] = useState(item?.valueName ?? "");
  const [valueType, setValueType] = useState<RegistryPreference["valueType"]>(item?.valueType ?? "REG_SZ");
  const [value, setValue] = useState(item?.value ?? "");
  const saveMutation = useSaveRegistry(gpo, scope, item?.uid, onSaved);

  const valid = key.trim().length > 0 && (action === "D" || valueName.trim().length > 0);

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Registrierung" : "Neue Eigenschaften für Registrierung"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                action,
                scope,
                hive,
                key,
                valueName,
                valueType,
                value,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as RegistryPreference["action"])}>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Struktur:</WinLabel>
          <WinSelect value={hive} onChange={(e) => setHive(e.target.value as RegistryPreference["hive"])}>
            {HIVE_OPTIONS_BY_SCOPE[scope].map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Schlüsselpfad:</WinLabel>
          <WinInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="Software\Contoso" autoFocus />
        </div>
        <div>
          <WinLabel>Wertename:</WinLabel>
          <WinInput value={valueName} onChange={(e) => setValueName(e.target.value)} placeholder="(Standard) leer lassen" />
        </div>
        <div>
          <WinLabel>Werttyp:</WinLabel>
          <WinSelect value={valueType} onChange={(e) => setValueType(e.target.value as RegistryPreference["valueType"])}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Wertedaten:</WinLabel>
          {valueType === "REG_MULTI_SZ" ? (
            <WinTextarea value={value} onChange={(e) => setValue(e.target.value)} rows={4} />
          ) : (
            <WinInput
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={valueType === "REG_DWORD" || valueType === "REG_QWORD" ? "0" : undefined}
            />
          )}
        </div>
      </div>
    </WindowsDialog>
  );
}
