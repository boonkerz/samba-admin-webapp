import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, StartMenuXpPreference, StartMenuVistaPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsButton, WinLabel, WinSelect, WinCheckbox, WinInput } from "../components/WindowsDialog";

const XP_FLAG_LABELS: [string, string][] = [
  ["largeMFUIcons", "Große Symbole verwenden"],
  ["autoCascade", "Neu installierte Programme automatisch einreihen"],
  ["notifyNewApps", "Über neu installierte Programme benachrichtigen"],
  ["enableDragDrop", "Drag & Drop zulassen"],
  ["showHelp", "Hilfe und Support anzeigen"],
  ["showNetPlaces", "Netzwerkumgebung anzeigen"],
  ["showPrinters", "Drucker und Faxgeräte anzeigen"],
  ["showRun", "Ausführen anzeigen"],
  ["scrollPrograms", "Programme-Liste durchblättern"],
  ["showSearch", "Suchen anzeigen"],
  ["clearStartDocsList", "Liste zuletzt geöffneter Dokumente löschen"],
  ["cShowLogoff", "(Klassisch) Abmelden anzeigen"],
  ["cShowRun", "(Klassisch) Ausführen anzeigen"],
  ["cEnableDragDrop", "(Klassisch) Drag & Drop zulassen"],
  ["cCascadeControlPanel", "(Klassisch) Systemsteuerung einreihen"],
  ["cCascadeMyDocuments", "(Klassisch) Eigene Dateien einreihen"],
  ["cCascadeMyPictures", "(Klassisch) Eigene Bilder einreihen"],
  ["cCascadeNetworkConnections", "(Klassisch) Netzwerkverbindungen einreihen"],
  ["cCascadePrinters", "(Klassisch) Drucker einreihen"],
  ["cScrollPrograms", "(Klassisch) Programme durchblättern"],
  ["cPersonalized", "(Klassisch) Personalisiertes Menü"],
];

const VISTA_FLAG_LABELS: [string, string][] = [
  ["connectTo", "Verbinden mit anzeigen"],
  ["defaultPrograms", "Standardprogramme anzeigen"],
  ["enableContextMenu", "Kontextmenüs zulassen"],
  ["showFavorites", "Favoriten anzeigen"],
  ["showHelp", "Hilfe anzeigen"],
  ["highlightNew", "Neu installierte Programme hervorheben"],
  ["showNetPlaces", "Netzwerk anzeigen"],
  ["openSubMenus", "Untermenüs beim Zeigen öffnen"],
  ["showPrinters", "Drucker anzeigen"],
  ["runCommand", "Ausführen anzeigen"],
  ["showSearch", "Suche anzeigen"],
  ["searchCommunications", "Kommunikation durchsuchen"],
  ["searchFavorites", "Favoriten und Verlauf durchsuchen"],
  ["searchPrograms", "Programme durchsuchen"],
  ["sortAllPrograms", "Alle Programme alphabetisch sortieren"],
  ["trackProgs", "Häufig verwendete Programme verfolgen"],
  ["useLargeIcons", "Große Symbole verwenden"],
  ["clearStartDocsList", "Liste zuletzt geöffneter Dokumente löschen"],
  ["cShowAdminTools", "(Klassisch) Verwaltung anzeigen"],
  ["cShowFavorites", "(Klassisch) Favoriten anzeigen"],
  ["cShowLogoff", "(Klassisch) Abmelden anzeigen"],
  ["cShowRun", "(Klassisch) Ausführen anzeigen"],
  ["cEnableDragDrop", "(Klassisch) Drag & Drop zulassen"],
  ["cCascadeControlPanel", "(Klassisch) Systemsteuerung einreihen"],
  ["cCascadeMyDocuments", "(Klassisch) Eigene Dateien einreihen"],
  ["cCascadeNetworkConnections", "(Klassisch) Netzwerkverbindungen einreihen"],
  ["cCascadeMyPictures", "(Klassisch) Eigene Bilder einreihen"],
  ["cCascadePrinters", "(Klassisch) Drucker einreihen"],
  ["cScrollPrograms", "(Klassisch) Programme durchblättern"],
  ["cSmallIcons", "(Klassisch) Kleine Symbole"],
  ["cPersonalized", "(Klassisch) Personalisiertes Menü"],
];

const SHOW_OPTIONS = [
  { value: "LINK", label: "Als Link" },
  { value: "MENU", label: "Als Menü" },
  { value: "0", label: "Nicht anzeigen" },
];

const DEFAULT_XP: Omit<StartMenuXpPreference, "uid"> = {
  minMFU: 6,
  showControlPanel: "LINK",
  startMenuFavorites: "SHOW",
  showMyComputer: "LINK",
  showMyDocs: "LINK",
  showMyMusic: "LINK",
  showMyPics: "LINK",
  showNetConn: "MENU",
  showRecentDocs: "MENU",
  flags: Object.fromEntries(XP_FLAG_LABELS.map(([k]) => [k, true])),
};

const DEFAULT_VISTA: Omit<StartMenuVistaPreference, "uid"> = {
  minMFU: 6,
  showControlPanel: "LINK",
  showMyComputer: "LINK",
  showMyDocs: "LINK",
  showMyMusic: "LINK",
  showMyPics: "LINK",
  showGames: "LINK",
  personalFolders: "LINK",
  showRecentDocs: "MENU",
  searchFiles: "INDEX",
  systemAdmin: "ALL",
  flags: Object.fromEntries(VISTA_FLAG_LABELS.map(([k]) => [k, true])),
};

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Startmenü properties pages (two independent singletons, XP and Vista+). */
export function StartMenuPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [tab, setTab] = useState<"xp" | "vista">("vista");

  const query = useQuery({
    queryKey: ["gpp-startmenu", gpo.guid],
    queryFn: () => api.get<{ xp?: StartMenuXpPreference; vista?: StartMenuVistaPreference }>(`/api/gpo/${gpo.guid}/startmenu`),
  });

  const [xpForm, setXpForm] = useState<Omit<StartMenuXpPreference, "uid">>(DEFAULT_XP);
  const [vistaForm, setVistaForm] = useState<Omit<StartMenuVistaPreference, "uid">>(DEFAULT_VISTA);

  useEffect(() => {
    if (query.data?.xp) {
      const { uid: _uid, ...rest } = query.data.xp;
      setXpForm(rest);
    }
    if (query.data?.vista) {
      const { uid: _uid, ...rest } = query.data.vista;
      setVistaForm(rest);
    }
  }, [query.data]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-startmenu", gpo.guid] });

  const saveXp = useMutation({
    mutationFn: () => api.put(`/api/gpo/${gpo.guid}/startmenu/xp`, xpForm),
    onSuccess: () => {
      pushToast("success", "Startmenü (Windows XP) gespeichert.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
  const deleteXp = useMutation({
    mutationFn: () => api.delete(`/api/gpo/${gpo.guid}/startmenu/xp`),
    onSuccess: () => {
      pushToast("success", "Startmenü (Windows XP) entfernt.");
      setXpForm(DEFAULT_XP);
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
  const saveVista = useMutation({
    mutationFn: () => api.put(`/api/gpo/${gpo.guid}/startmenu/vista`, vistaForm),
    onSuccess: () => {
      pushToast("success", "Startmenü (Windows Vista) gespeichert.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
  const deleteVista = useMutation({
    mutationFn: () => api.delete(`/api/gpo/${gpo.guid}/startmenu/vista`),
    onSuccess: () => {
      pushToast("success", "Startmenü (Windows Vista) entfernt.");
      setVistaForm(DEFAULT_VISTA);
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  if (query.isLoading) {
    return <p className="p-4 text-sm text-slate-400">Lade…</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Startmenü</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Startmenü-Einstellungen für Benutzer.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200 pt-2 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setTab("vista")}
          className={`rounded-t px-3 py-1 text-sm ${tab === "vista" ? "bg-slate-100 font-medium dark:bg-slate-800" : "text-slate-500"}`}
        >
          Windows Vista+
        </button>
        <button
          type="button"
          onClick={() => setTab("xp")}
          className={`rounded-t px-3 py-1 text-sm ${tab === "xp" ? "bg-slate-100 font-medium dark:bg-slate-800" : "text-slate-500"}`}
        >
          Windows XP
        </button>
      </div>

      {tab === "vista" && (
        <div className="py-4">
          <div className="mb-3 flex justify-end gap-2">
            {query.data?.vista && (
              <WindowsButton onClick={() => deleteVista.mutate()} disabled={deleteVista.isPending}>
                Entfernen
              </WindowsButton>
            )}
            <WindowsButton variant="primary" onClick={() => saveVista.mutate()} disabled={saveVista.isPending}>
              Speichern
            </WindowsButton>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <WinLabel>Systemsteuerung:</WinLabel>
              <WinSelect value={vistaForm.showControlPanel} onChange={(e) => setVistaForm({ ...vistaForm, showControlPanel: e.target.value as StartMenuVistaPreference["showControlPanel"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Computer:</WinLabel>
              <WinSelect value={vistaForm.showMyComputer} onChange={(e) => setVistaForm({ ...vistaForm, showMyComputer: e.target.value as StartMenuVistaPreference["showMyComputer"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Dokumente:</WinLabel>
              <WinSelect value={vistaForm.showMyDocs} onChange={(e) => setVistaForm({ ...vistaForm, showMyDocs: e.target.value as StartMenuVistaPreference["showMyDocs"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Musik:</WinLabel>
              <WinSelect value={vistaForm.showMyMusic} onChange={(e) => setVistaForm({ ...vistaForm, showMyMusic: e.target.value as StartMenuVistaPreference["showMyMusic"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Bilder:</WinLabel>
              <WinSelect value={vistaForm.showMyPics} onChange={(e) => setVistaForm({ ...vistaForm, showMyPics: e.target.value as StartMenuVistaPreference["showMyPics"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Spiele:</WinLabel>
              <WinSelect value={vistaForm.showGames} onChange={(e) => setVistaForm({ ...vistaForm, showGames: e.target.value as StartMenuVistaPreference["showGames"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Persönliche Ordner:</WinLabel>
              <WinSelect value={vistaForm.personalFolders} onChange={(e) => setVistaForm({ ...vistaForm, personalFolders: e.target.value as StartMenuVistaPreference["personalFolders"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Zuletzt verwendete Elemente:</WinLabel>
              <WinSelect value={vistaForm.showRecentDocs} onChange={(e) => setVistaForm({ ...vistaForm, showRecentDocs: e.target.value as StartMenuVistaPreference["showRecentDocs"] })}>
                <option value="MENU">Als Menü</option>
                <option value="1">Anzeigen</option>
                <option value="0">Nicht anzeigen</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Dateisuche:</WinLabel>
              <WinSelect value={vistaForm.searchFiles} onChange={(e) => setVistaForm({ ...vistaForm, searchFiles: e.target.value as StartMenuVistaPreference["searchFiles"] })}>
                <option value="INDEX">Nur indizierte Dateinamen</option>
                <option value="NOINDEX">Dateinamen und -inhalte</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Verwaltungstools:</WinLabel>
              <WinSelect value={vistaForm.systemAdmin} onChange={(e) => setVistaForm({ ...vistaForm, systemAdmin: e.target.value as StartMenuVistaPreference["systemAdmin"] })}>
                <option value="ALL">Alle anzeigen</option>
                <option value="NORMAL">Normal</option>
                <option value="NONE">Nicht anzeigen</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Anzahl zuletzt verwendeter Programme:</WinLabel>
              <WinInput type="number" value={vistaForm.minMFU} onChange={(e) => setVistaForm({ ...vistaForm, minMFU: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1">
            {VISTA_FLAG_LABELS.map(([key, label]) => (
              <WinCheckbox
                key={key}
                label={label}
                checked={vistaForm.flags[key] ?? false}
                onChange={(e) => setVistaForm({ ...vistaForm, flags: { ...vistaForm.flags, [key]: e.target.checked } })}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "xp" && (
        <div className="py-4">
          <div className="mb-3 flex justify-end gap-2">
            {query.data?.xp && (
              <WindowsButton onClick={() => deleteXp.mutate()} disabled={deleteXp.isPending}>
                Entfernen
              </WindowsButton>
            )}
            <WindowsButton variant="primary" onClick={() => saveXp.mutate()} disabled={saveXp.isPending}>
              Speichern
            </WindowsButton>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <WinLabel>Systemsteuerung:</WinLabel>
              <WinSelect value={xpForm.showControlPanel} onChange={(e) => setXpForm({ ...xpForm, showControlPanel: e.target.value as StartMenuXpPreference["showControlPanel"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Favoritenmenü:</WinLabel>
              <WinSelect value={xpForm.startMenuFavorites} onChange={(e) => setXpForm({ ...xpForm, startMenuFavorites: e.target.value as StartMenuXpPreference["startMenuFavorites"] })}>
                <option value="SHOW">Anzeigen</option>
                <option value="HIDE">Ausblenden</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Arbeitsplatz:</WinLabel>
              <WinSelect value={xpForm.showMyComputer} onChange={(e) => setXpForm({ ...xpForm, showMyComputer: e.target.value as StartMenuXpPreference["showMyComputer"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Eigene Dateien:</WinLabel>
              <WinSelect value={xpForm.showMyDocs} onChange={(e) => setXpForm({ ...xpForm, showMyDocs: e.target.value as StartMenuXpPreference["showMyDocs"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Eigene Musik:</WinLabel>
              <WinSelect value={xpForm.showMyMusic} onChange={(e) => setXpForm({ ...xpForm, showMyMusic: e.target.value as StartMenuXpPreference["showMyMusic"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Eigene Bilder:</WinLabel>
              <WinSelect value={xpForm.showMyPics} onChange={(e) => setXpForm({ ...xpForm, showMyPics: e.target.value as StartMenuXpPreference["showMyPics"] })}>
                {SHOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Netzwerkverbindungen:</WinLabel>
              <WinSelect value={xpForm.showNetConn} onChange={(e) => setXpForm({ ...xpForm, showNetConn: e.target.value as StartMenuXpPreference["showNetConn"] })}>
                <option value="MENU">Als Menü</option>
                <option value="LINK">Als Link</option>
                <option value="0">Nicht anzeigen</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Zuletzt geöffnete Dokumente:</WinLabel>
              <WinSelect value={xpForm.showRecentDocs} onChange={(e) => setXpForm({ ...xpForm, showRecentDocs: e.target.value as StartMenuXpPreference["showRecentDocs"] })}>
                <option value="MENU">Als Menü</option>
                <option value="1">Anzeigen</option>
                <option value="0">Nicht anzeigen</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Anzahl zuletzt verwendeter Programme:</WinLabel>
              <WinInput type="number" value={xpForm.minMFU} onChange={(e) => setXpForm({ ...xpForm, minMFU: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1">
            {XP_FLAG_LABELS.map(([key, label]) => (
              <WinCheckbox
                key={key}
                label={label}
                checked={xpForm.flags[key] ?? false}
                onChange={(e) => setXpForm({ ...xpForm, flags: { ...xpForm.flags, [key]: e.target.checked } })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
