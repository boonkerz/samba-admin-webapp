import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  GpoObject,
  GlobalFolderOptionsXpPreference,
  GlobalFolderOptionsVistaPreference,
  OpenWithPreference,
  FileTypePreference,
} from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

function useSaveFolderOptions(gpo: GpoObject, uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid ? api.put(`/api/gpo/${gpo.guid}/folderoptions/${uid}`, body) : api.post(`/api/gpo/${gpo.guid}/folderoptions`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Ordneroption aktualisiert." : "Ordneroption erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Eigenschaften für Ordneroptionen (Windows XP)" dialog. */
export function GlobalFolderOptionsXpDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: GlobalFolderOptionsXpPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p, setP] = useState({
    noNetCrawling: item?.noNetCrawling ?? false,
    folderContentsInfoTip: item?.folderContentsInfoTip ?? true,
    friendlyTree: item?.friendlyTree ?? true,
    fullPathAddress: item?.fullPathAddress ?? true,
    fullPath: item?.fullPath ?? false,
    disableThumbnailCache: item?.disableThumbnailCache ?? false,
    hidden: item?.hidden ?? ("SHOWALL" as const),
    hideFileExt: item?.hideFileExt ?? true,
    separateProcess: item?.separateProcess ?? false,
    showSuperHidden: item?.showSuperHidden ?? false,
    classicViewState: item?.classicViewState ?? false,
    persistBrowsers: item?.persistBrowsers ?? false,
    showControlPanel: item?.showControlPanel ?? true,
    showCompColor: item?.showCompColor ?? true,
    showInfoTip: item?.showInfoTip ?? true,
    webViewBarricade: item?.webViewBarricade ?? false,
    forceGuest: item?.forceGuest ?? false,
  });
  const saveMutation = useSaveFolderOptions(gpo, item?.uid, onSaved);
  type P = typeof p;
  const cb = <K extends keyof P>(label: string, key: K) => (
    <WinCheckbox label={label} checked={p[key] as boolean} onChange={(e) => setP({ ...p, [key]: e.target.checked })} />
  );

  return (
    <WindowsDialog
      title="Eigenschaften für Ordneroptionen (Windows XP)"
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ kind: "globalXp", action: "U", ...p })}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {cb("Netzwerkordner nicht durchsuchen", "noNetCrawling")}
        {cb("QuickInfo mit Ordnerinhalt", "folderContentsInfoTip")}
        {cb("Einfache Ordneransicht", "friendlyTree")}
        {cb("Vollständigen Pfad in Adressleiste anzeigen", "fullPathAddress")}
        {cb("Vollständigen Pfad in Titelleiste anzeigen", "fullPath")}
        {cb("Miniaturansicht-Cache deaktivieren", "disableThumbnailCache")}
        {cb("Dateierweiterungen ausblenden", "hideFileExt")}
        {cb("Ordnerfenster in eigenem Prozess starten", "separateProcess")}
        {cb("Geschützte Systemdateien anzeigen", "showSuperHidden")}
        {cb("Klassische Ansicht verwenden", "classicViewState")}
        {cb("Ordnerfenster einzeln merken", "persistBrowsers")}
        {cb("Systemsteuerung im Ordnerfenster anzeigen", "showControlPanel")}
        {cb("Verschlüsselte/komprimierte Dateien farbig", "showCompColor")}
        {cb("QuickInfo für Dateien und Ordner anzeigen", "showInfoTip")}
        {cb("Webansicht-Barrikade", "webViewBarricade")}
        {cb("Einfache Dateifreigabe für Gastkonto erzwingen", "forceGuest")}
      </div>
      <div className="mt-3">
        <WinLabel>Versteckte Dateien und Ordner:</WinLabel>
        <WinSelect value={p.hidden} onChange={(e) => setP({ ...p, hidden: e.target.value as P["hidden"] })}>
          <option value="SHOWALL">Alle Dateien und Ordner anzeigen</option>
          <option value="HIDE">Ausgeblendete Dateien nicht anzeigen</option>
        </WinSelect>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Eigenschaften für Ordneroptionen (Windows Vista)" dialog. */
export function GlobalFolderOptionsVistaDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: GlobalFolderOptionsVistaPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p, setP] = useState({
    alwaysShowIcons: item?.alwaysShowIcons ?? false,
    alwaysShowMenus: item?.alwaysShowMenus ?? false,
    displayIconThumb: item?.displayIconThumb ?? true,
    displayFileSize: item?.displayFileSize ?? true,
    displaySimpleFolders: item?.displaySimpleFolders ?? true,
    fullPath: item?.fullPath ?? false,
    hidden: item?.hidden ?? ("SHOWALL" as const),
    hideFileExt: item?.hideFileExt ?? true,
    showSuperHidden: item?.showSuperHidden ?? false,
    separateProcess: item?.separateProcess ?? false,
    classicViewState: item?.classicViewState ?? false,
    persistBrowsers: item?.persistBrowsers ?? false,
    showDriveLetter: item?.showDriveLetter ?? true,
    showCompColor: item?.showCompColor ?? true,
    showInfoTip: item?.showInfoTip ?? true,
    showPreviewHandlers: item?.showPreviewHandlers ?? true,
    useCheckBoxes: item?.useCheckBoxes ?? false,
    useSharingWizard: item?.useSharingWizard ?? true,
    listViewTyping: item?.listViewTyping ?? ("SELECT" as const),
  });
  const saveMutation = useSaveFolderOptions(gpo, item?.uid, onSaved);
  type P = typeof p;
  const cb = <K extends keyof P>(label: string, key: K) => (
    <WinCheckbox label={label} checked={p[key] as boolean} onChange={(e) => setP({ ...p, [key]: e.target.checked })} />
  );

  return (
    <WindowsDialog
      title="Eigenschaften für Ordneroptionen (mind. Windows Vista)"
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ kind: "globalVista", action: "U", ...p })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {cb("Symbole immer anzeigen, nie Miniaturansichten", "alwaysShowIcons")}
        {cb("Menüleiste immer anzeigen", "alwaysShowMenus")}
        {cb("Symbol auf Miniaturansichten anzeigen", "displayIconThumb")}
        {cb("Dateigröße in Ordnertipps anzeigen", "displayFileSize")}
        {cb("Einfache Ordneransicht im Navigationsbereich", "displaySimpleFolders")}
        {cb("Vollständigen Pfad in Titelleiste anzeigen", "fullPath")}
        {cb("Dateierweiterungen ausblenden", "hideFileExt")}
        {cb("Geschützte Systemdateien anzeigen", "showSuperHidden")}
        {cb("Ordnerfenster in eigenem Prozess starten", "separateProcess")}
        {cb("Klassische Ansicht verwenden", "classicViewState")}
        {cb("Ordnerfenster einzeln merken", "persistBrowsers")}
        {cb("Laufwerksbuchstabe anzeigen", "showDriveLetter")}
        {cb("Verschlüsselte/komprimierte Dateien farbig", "showCompColor")}
        {cb("QuickInfo für Dateien und Ordner anzeigen", "showInfoTip")}
        {cb("Popupbeschreibung für Ordner und Desktopelemente", "showPreviewHandlers")}
        {cb("Kontrollkästchen zur Auswahl verwenden", "useCheckBoxes")}
        {cb("Freigabeassistent verwenden", "useSharingWizard")}
      </div>
      <div className="mt-3">
        <WinLabel>Versteckte Dateien und Ordner:</WinLabel>
        <WinSelect value={p.hidden} onChange={(e) => setP({ ...p, hidden: e.target.value as P["hidden"] })}>
          <option value="SHOWALL">Alle Dateien und Ordner anzeigen</option>
          <option value="HIDE">Ausgeblendete Dateien nicht anzeigen</option>
        </WinSelect>
      </div>
      <div className="mt-3">
        <WinLabel>Zur Auswahl eines Elements in Ansicht:</WinLabel>
        <WinSelect value={p.listViewTyping} onChange={(e) => setP({ ...p, listViewTyping: e.target.value as P["listViewTyping"] })}>
          <option value="SELECT">Automatisch markieren</option>
          <option value="TYPE">Zum Suchen in der Liste eingeben</option>
        </WinSelect>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Eigenschaften für Öffnen mit" dialog. */
export function OpenWithDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: OpenWithPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fileExtension, setFileExtension] = useState(item?.fileExtension ?? "");
  const [applicationPath, setApplicationPath] = useState(item?.applicationPath ?? "");
  const [isDefault, setIsDefault] = useState(item?.default ?? true);
  const saveMutation = useSaveFolderOptions(gpo, item?.uid, onSaved);
  const valid = fileExtension.trim().length > 0 && applicationPath.trim().length > 0;

  return (
    <WindowsDialog
      title="Eigenschaften für Öffnen mit"
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ kind: "openWith", action: "U", fileExtension, applicationPath, default: isDefault })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Dateierweiterung:</WinLabel>
          <WinInput value={fileExtension} onChange={(e) => setFileExtension(e.target.value)} placeholder="salt" autoFocus />
        </div>
        <div>
          <WinLabel>Anwendungspfad:</WinLabel>
          <WinInput value={applicationPath} onChange={(e) => setApplicationPath(e.target.value)} placeholder="notepad.exe" />
        </div>
        <WinCheckbox label="Als Standardprogramm festlegen" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Eigenschaften für Dateizuordnung" dialog. */
export function FileTypeDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: FileTypePreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fileExt, setFileExt] = useState(item?.fileExt ?? "");
  const [application, setApplication] = useState(item?.application ?? "");
  const [appProgID, setAppProgID] = useState(item?.appProgID ?? "");
  const [configActions, setConfigActions] = useState(item?.configActions ?? false);
  const saveMutation = useSaveFolderOptions(gpo, item?.uid, onSaved);
  const valid = fileExt.trim().length > 0 && appProgID.trim().length > 0;

  return (
    <WindowsDialog
      title="Eigenschaften für Dateizuordnung"
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ kind: "fileType", action: "U", fileExt, application, appProgID, configActions })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Dateinamenerweiterung:</WinLabel>
          <WinInput value={fileExt} onChange={(e) => setFileExt(e.target.value)} placeholder="salt" autoFocus />
        </div>
        <div>
          <WinLabel>Anwendungsname (Anzeige):</WinLabel>
          <WinInput value={application} onChange={(e) => setApplication(e.target.value)} placeholder="ActiveMovie Control Object" />
        </div>
        <div>
          <WinLabel>Programm-ID (ProgID):</WinLabel>
          <WinInput value={appProgID} onChange={(e) => setAppProgID(e.target.value)} placeholder="AMOVIE.ActiveMovie Control" />
        </div>
        <WinCheckbox
          label="Aktionen (Öffnen, Bearbeiten, ...) konfigurieren"
          checked={configActions}
          onChange={(e) => setConfigActions(e.target.checked)}
        />
      </div>
    </WindowsDialog>
  );
}
