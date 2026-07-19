import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GpoObject, DriveMapPreference, CommonItemOptions } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox, type WinTab } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { CommonOptionsTab, defaultCommonItemOptions } from "./CommonOptionsTab";

const ACTION_OPTIONS = [
  { value: "C", label: "Erstellen" },
  { value: "R", label: "Ersetzen" },
  { value: "U", label: "Aktualisieren" },
  { value: "D", label: "Löschen" },
];

const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

const TABS: WinTab[] = [
  { id: "general", label: "Allgemein" },
  { id: "common", label: "Gemeinsame Optionen" },
];

function useSaveDriveMap(gpo: GpoObject, uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid ? api.put(`/api/gpo/${gpo.guid}/drivemaps/${uid}`, body) : api.post(`/api/gpo/${gpo.guid}/drivemaps`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Laufwerkzuordnung aktualisiert." : "Laufwerkzuordnung erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Neue Eigenschaften für zugeordnete Laufwerke" dialog. */
export function DriveMapDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: DriveMapPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("general");
  const [action, setAction] = useState<DriveMapPreference["action"]>(item?.action ?? "U");
  const [driveLocation, setDriveLocation] = useState(item?.path ?? "");
  const [label, setLabel] = useState(item?.label ?? "");
  const [useLetter, setUseLetter] = useState(item?.useLetter ?? true);
  const [letter, setLetter] = useState(item?.letter ?? "Z");
  const [persistent, setPersistent] = useState(item?.persistent ?? true);
  const [common, setCommon] = useState<CommonItemOptions>(item?.common ?? defaultCommonItemOptions());
  const saveMutation = useSaveDriveMap(gpo, item?.uid, onSaved);

  const valid = driveLocation.trim().startsWith("\\\\");

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für zugeordnete Laufwerke" : "Neue Eigenschaften für zugeordnete Laufwerke"}
      onClose={onClose}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                action,
                path: driveLocation,
                label: label || undefined,
                useLetter,
                letter: useLetter ? letter : undefined,
                persistent,
                common,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      {tab === "general" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Aktion:</WinLabel>
            <WinSelect value={action} onChange={(e) => setAction(e.target.value as DriveMapPreference["action"])}>
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </WinSelect>
          </div>
          <div>
            <WinLabel>Standort:</WinLabel>
            <WinInput value={driveLocation} onChange={(e) => setDriveLocation(e.target.value)} placeholder="\\\\server\\freigabe" autoFocus />
          </div>
          <div>
            <WinLabel>Bezeichnen als:</WinLabel>
            <WinInput value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <WinCheckbox label="Verbindung wiederherstellen" checked={persistent} onChange={(e) => setPersistent(e.target.checked)} />

          <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
            <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Laufwerkbuchstabe</legend>
            <div className="space-y-2">
              <WinCheckbox
                label="Verwenden: Bestimmt"
                checked={useLetter}
                onChange={(e) => setUseLetter(e.target.checked)}
              />
              <div className="pl-6">
                <WinSelect value={letter} disabled={!useLetter} onChange={(e) => setLetter(e.target.value)}>
                  {LETTERS.map((l) => (
                    <option key={l} value={l}>
                      {l}:
                    </option>
                  ))}
                </WinSelect>
              </div>
              {!useLetter && <p className="pl-6 text-xs text-slate-500 dark:text-slate-400">Erster verfügbarer Buchstabe wird verwendet.</p>}
            </div>
          </fieldset>
        </div>
      )}

      {tab === "common" && <CommonOptionsTab value={common} onChange={setCommon} showRunInUserContext={false} />}
    </WindowsDialog>
  );
}
