import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AdUser, SetupSummary, UpdateUserRequest } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinCheckbox, WinTextarea, type WinTab } from "../components/WindowsDialog";
import { dnToCn } from "./dnPath";
import { ObjectPickerDialog } from "./ObjectPickerDialog";

const TABS: WinTab[] = [
  { id: "general", label: "Allgemein" },
  { id: "address", label: "Adresse" },
  { id: "account", label: "Konto" },
  { id: "profile", label: "Profil" },
  { id: "dialin", label: "Einwählen" },
  { id: "environment", label: "Umgebung" },
  { id: "sessions", label: "Sitzungen" },
  { id: "phones", label: "Rufnummern" },
  { id: "org", label: "Organisation" },
  { id: "memberOf", label: "Mitglied von" },
];

function buildUpdatePayload(f: AdUser): UpdateUserRequest {
  return {
    sAMAccountName: f.sAMAccountName,
    givenName: f.givenName,
    sn: f.sn,
    initials: f.initials,
    displayName: f.displayName,
    description: f.description,
    userPrincipalName: f.userPrincipalName,
    office: f.office,
    telephoneNumber: f.telephoneNumber,
    email: f.email,
    homePage: f.homePage,
    streetAddress: f.streetAddress,
    poBox: f.poBox,
    city: f.city,
    state: f.state,
    postalCode: f.postalCode,
    country: f.country,
    homePhone: f.homePhone,
    pager: f.pager,
    mobile: f.mobile,
    fax: f.fax,
    ipPhone: f.ipPhone,
    notes: f.notes,
    title: f.title,
    department: f.department,
    company: f.company,
    manager: f.manager,
    profilePath: f.profilePath,
    scriptPath: f.scriptPath,
    homeDrive: f.homeDrive,
    homeDirectory: f.homeDirectory,
    accountExpires: f.accountExpires,
    enabled: f.enabled,
    passwordNeverExpires: f.passwordNeverExpires,
    mustChangePasswordAtNextLogon: f.mustChangePasswordAtNextLogon,
    smartcardRequired: f.smartcardRequired,
    networkAccessPermission: f.networkAccessPermission,
    callbackNumber: f.callbackNumber,
    tsInitialProgram: f.tsInitialProgram,
    tsWorkDirectory: f.tsWorkDirectory,
    tsConnectClientDrives: f.tsConnectClientDrives,
    tsConnectPrinterDrives: f.tsConnectPrinterDrives,
    tsDefaultToMainPrinter: f.tsDefaultToMainPrinter,
    tsMaxDisconnectionTimeMin: f.tsMaxDisconnectionTimeMin,
    tsMaxConnectionTimeMin: f.tsMaxConnectionTimeMin,
    tsMaxIdleTimeMin: f.tsMaxIdleTimeMin,
    tsReconnectFromOriginatingClientOnly: f.tsReconnectFromOriginatingClientOnly,
  };
}

export function UserPropertiesDialog({ user, onClose, onChanged }: { user: AdUser; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState<AdUser>(user);
  const [dirty, setDirty] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const pushToast = useToastStore((s) => s.push);
  const summaryQuery = useQuery({ queryKey: ["setup-summary"], queryFn: () => api.get<SetupSummary>("/api/setup/summary") });
  const realm = summaryQuery.data?.realm ?? "";
  const netbios = summaryQuery.data?.domain ?? "";

  function set<K extends keyof AdUser>(key: K, value: AdUser[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => api.patch<AdUser>(`/api/directory/users/${encodeDn(user.dn)}`, buildUpdatePayload(form)),
    onSuccess: () => {
      pushToast("success", "Änderungen gespeichert.");
      setDirty(false);
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const addMemberMutation = useMutation({
    mutationFn: (groupDn: string) => api.post(`/api/directory/groups/${encodeDn(groupDn)}/members`, { memberDn: user.dn }),
    onSuccess: (_data, groupDn) => {
      setForm((f) => (f.memberOf.includes(groupDn) ? f : { ...f, memberOf: [...f.memberOf, groupDn] }));
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleGroupsSelected(groups: { dn: string; name: string }[]) {
    setShowGroupPicker(false);
    for (const group of groups) addMemberMutation.mutate(group.dn);
    pushToast("success", groups.length === 1 ? `Zu "${groups[0].name}" hinzugefügt.` : `Zu ${groups.length} Gruppen hinzugefügt.`);
  }

  const removeMemberMutation = useMutation({
    mutationFn: (groupDn: string) => api.delete(`/api/directory/groups/${encodeDn(groupDn)}/members/${encodeDn(user.dn)}`),
    onSuccess: (_data, groupDn) => {
      pushToast("success", "Aus Gruppe entfernt.");
      setForm((f) => ({ ...f, memberOf: f.memberOf.filter((g) => g !== groupDn) }));
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleOk() {
    saveMutation.mutate(undefined, { onSuccess: onClose });
  }

  return (
    <WindowsDialog
      title={`Eigenschaften von ${user.displayName || dnToCn(user.dn)}`}
      onClose={onClose}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <WindowsButton variant="primary" onClick={handleOk} disabled={saveMutation.isPending}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
          <WindowsButton onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
            Übernehmen
          </WindowsButton>
        </>
      }
    >
      {tab === "general" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 pb-2">
            <span className="text-3xl">👤</span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{form.displayName || dnToCn(user.dn)}</span>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <WinLabel>Vorname:</WinLabel>
              <WinInput value={form.givenName ?? ""} onChange={(e) => set("givenName", e.target.value)} />
            </div>
            <div className="w-20">
              <WinLabel>Initialen:</WinLabel>
              <WinInput value={form.initials ?? ""} onChange={(e) => set("initials", e.target.value)} />
            </div>
          </div>
          <div>
            <WinLabel>Nachname:</WinLabel>
            <WinInput value={form.sn ?? ""} onChange={(e) => set("sn", e.target.value)} />
          </div>
          <div>
            <WinLabel>Anzeigename:</WinLabel>
            <WinInput value={form.displayName ?? ""} onChange={(e) => set("displayName", e.target.value)} />
          </div>
          <div>
            <WinLabel>Beschreibung:</WinLabel>
            <WinInput value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div>
            <WinLabel>Büro:</WinLabel>
            <WinInput value={form.office ?? ""} onChange={(e) => set("office", e.target.value)} />
          </div>
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <WinLabel>Rufnummer:</WinLabel>
            <WinInput value={form.telephoneNumber ?? ""} onChange={(e) => set("telephoneNumber", e.target.value)} />
          </div>
          <div>
            <WinLabel>E-Mail:</WinLabel>
            <WinInput type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <WinLabel>Webseite:</WinLabel>
            <WinInput value={form.homePage ?? ""} onChange={(e) => set("homePage", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "address" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Straße:</WinLabel>
            <WinTextarea rows={3} value={form.streetAddress ?? ""} onChange={(e) => set("streetAddress", e.target.value)} />
          </div>
          <div>
            <WinLabel>Postfach:</WinLabel>
            <WinInput value={form.poBox ?? ""} onChange={(e) => set("poBox", e.target.value)} />
          </div>
          <div>
            <WinLabel>Ort:</WinLabel>
            <WinInput value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <WinLabel>Bundesland/Kanton:</WinLabel>
            <WinInput value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div>
            <WinLabel>PLZ:</WinLabel>
            <WinInput value={form.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} />
          </div>
          <div>
            <WinLabel>Land/Region:</WinLabel>
            <WinInput value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Benutzeranmeldename:</WinLabel>
            <div className="flex gap-2">
              <WinInput
                value={form.userPrincipalName?.split("@")[0] ?? ""}
                onChange={(e) => set("userPrincipalName", `${e.target.value}@${form.userPrincipalName?.split("@")[1] ?? realm}`)}
                className="flex-1"
              />
              <div className="flex items-center rounded-sm border border-slate-400 bg-slate-100 px-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                @{form.userPrincipalName?.split("@")[1] ?? realm}
              </div>
            </div>
          </div>
          <div>
            <WinLabel>Benutzeranmeldename (Prä-Windows 2000):</WinLabel>
            <div className="flex gap-2">
              <div className="flex items-center rounded-sm border border-slate-400 bg-slate-100 px-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {netbios}\
              </div>
              <WinInput value={form.sAMAccountName} onChange={(e) => set("sAMAccountName", e.target.value)} className="flex-1" />
            </div>
          </div>

          <div className="pt-1">
            <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Kontooptionen:</p>
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-sm border border-slate-300 p-2 dark:border-slate-600">
              <WinCheckbox
                label="Benutzer muss Kennwort bei der nächsten Anmeldung ändern"
                checked={form.mustChangePasswordAtNextLogon}
                onChange={(e) => {
                  set("mustChangePasswordAtNextLogon", e.target.checked);
                  if (e.target.checked) set("passwordNeverExpires", false);
                }}
              />
              <WinCheckbox
                label="Kennwort läuft nie ab"
                checked={form.passwordNeverExpires}
                onChange={(e) => {
                  set("passwordNeverExpires", e.target.checked);
                  if (e.target.checked) set("mustChangePasswordAtNextLogon", false);
                }}
              />
              <WinCheckbox label="Konto ist deaktiviert" checked={!form.enabled} onChange={(e) => set("enabled", !e.target.checked)} />
              <WinCheckbox
                label="Smartcard für interaktive Anmeldung erforderlich"
                checked={form.smartcardRequired}
                onChange={(e) => set("smartcardRequired", e.target.checked)}
              />
            </div>
          </div>

          <div className="pt-1">
            <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Konto läuft ab:</p>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                <input
                  type="radio"
                  checked={!form.accountExpires}
                  onChange={() => set("accountExpires", undefined)}
                  className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
                />
                Nie
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                <input
                  type="radio"
                  checked={!!form.accountExpires}
                  onChange={() => set("accountExpires", new Date().toISOString())}
                  className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
                />
                Am:
                <WinInput
                  type="date"
                  disabled={!form.accountExpires}
                  value={form.accountExpires ? form.accountExpires.slice(0, 10) : ""}
                  onChange={(e) => set("accountExpires", e.target.value ? new Date(e.target.value).toISOString() : undefined)}
                  className="w-40"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Benutzerprofil</p>
          <div>
            <WinLabel>Profilpfad:</WinLabel>
            <WinInput value={form.profilePath ?? ""} onChange={(e) => set("profilePath", e.target.value)} />
          </div>
          <div>
            <WinLabel>Anmeldeskript:</WinLabel>
            <WinInput value={form.scriptPath ?? ""} onChange={(e) => set("scriptPath", e.target.value)} />
          </div>
          <p className="pt-2 text-sm font-medium text-slate-800 dark:text-slate-200">Basisordner</p>
          <div className="flex gap-3">
            <div className="w-24">
              <WinLabel>Laufwerk:</WinLabel>
              <WinInput value={form.homeDrive ?? ""} onChange={(e) => set("homeDrive", e.target.value)} placeholder="Z:" />
            </div>
            <div className="flex-1">
              <WinLabel>Lokaler Pfad:</WinLabel>
              <WinInput value={form.homeDirectory ?? ""} onChange={(e) => set("homeDirectory", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {tab === "dialin" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Netzwerkzugriffsberechtigung</p>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                checked={form.networkAccessPermission === "allow"}
                onChange={() => set("networkAccessPermission", "allow")}
                className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
              />
              Zugriff gestatten
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                checked={form.networkAccessPermission === "deny"}
                onChange={() => set("networkAccessPermission", "deny")}
                className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
              />
              Zugriff verweigern
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                checked={form.networkAccessPermission === "policy"}
                onChange={() => set("networkAccessPermission", "policy")}
                className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
              />
              Zugriff über NPS-Netzwerkrichtlinie steuern
            </label>
          </div>
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <div>
            <WinLabel>Rückrufnummer:</WinLabel>
            <WinInput value={form.callbackNumber ?? ""} onChange={(e) => set("callbackNumber", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "environment" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Startprogramm</p>
          <div>
            <WinLabel>Programmdateiname:</WinLabel>
            <WinInput value={form.tsInitialProgram ?? ""} onChange={(e) => set("tsInitialProgram", e.target.value)} />
          </div>
          <div>
            <WinLabel>Arbeitsverzeichnis beginnt in:</WinLabel>
            <WinInput value={form.tsWorkDirectory ?? ""} onChange={(e) => set("tsWorkDirectory", e.target.value)} />
          </div>
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Clientgeräte beim Anmelden verbinden</p>
          <WinCheckbox
            label="Clientlaufwerke bei der Anmeldung verbinden"
            checked={form.tsConnectClientDrives}
            onChange={(e) => set("tsConnectClientDrives", e.target.checked)}
          />
          <WinCheckbox
            label="Clientdrucker bei der Anmeldung verbinden"
            checked={form.tsConnectPrinterDrives}
            onChange={(e) => set("tsConnectPrinterDrives", e.target.checked)}
          />
          <WinCheckbox
            label="Nur den Standarddrucker des Clients als Standard festlegen"
            checked={form.tsDefaultToMainPrinter}
            onChange={(e) => set("tsDefaultToMainPrinter", e.target.checked)}
          />
        </div>
      )}

      {tab === "sessions" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Zeitlimits</p>
          <div>
            <WinLabel>Getrennte Sitzung beenden (Minuten, leer = nie):</WinLabel>
            <WinInput
              type="number"
              value={form.tsMaxDisconnectionTimeMin ?? ""}
              onChange={(e) => set("tsMaxDisconnectionTimeMin", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <WinLabel>Aktive Sitzungslimit (Minuten, leer = nie):</WinLabel>
            <WinInput
              type="number"
              value={form.tsMaxConnectionTimeMin ?? ""}
              onChange={(e) => set("tsMaxConnectionTimeMin", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <WinLabel>Leerlaufsitzungslimit (Minuten, leer = nie):</WinLabel>
            <WinInput
              type="number"
              value={form.tsMaxIdleTimeMin ?? ""}
              onChange={(e) => set("tsMaxIdleTimeMin", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Bei einer erneuten Verbindung mit einer unterbrochenen Sitzung</p>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                checked={!form.tsReconnectFromOriginatingClientOnly}
                onChange={() => set("tsReconnectFromOriginatingClientOnly", false)}
                className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
              />
              Von jedem Client aus
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
              <input
                type="radio"
                checked={form.tsReconnectFromOriginatingClientOnly}
                onChange={() => set("tsReconnectFromOriginatingClientOnly", true)}
                className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
              />
              Nur vom Client aus, von dem eine Verbindung hergestellt wurde
            </label>
          </div>
        </div>
      )}

      {tab === "phones" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Privat:</WinLabel>
            <WinInput value={form.homePhone ?? ""} onChange={(e) => set("homePhone", e.target.value)} />
          </div>
          <div>
            <WinLabel>Pager:</WinLabel>
            <WinInput value={form.pager ?? ""} onChange={(e) => set("pager", e.target.value)} />
          </div>
          <div>
            <WinLabel>Mobil:</WinLabel>
            <WinInput value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} />
          </div>
          <div>
            <WinLabel>Fax:</WinLabel>
            <WinInput value={form.fax ?? ""} onChange={(e) => set("fax", e.target.value)} />
          </div>
          <div>
            <WinLabel>IP-Telefon:</WinLabel>
            <WinInput value={form.ipPhone ?? ""} onChange={(e) => set("ipPhone", e.target.value)} />
          </div>
          <div>
            <WinLabel>Anmerkung:</WinLabel>
            <WinTextarea rows={4} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "org" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Position:</WinLabel>
            <WinInput value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <WinLabel>Abteilung:</WinLabel>
            <WinInput value={form.department ?? ""} onChange={(e) => set("department", e.target.value)} />
          </div>
          <div>
            <WinLabel>Firma:</WinLabel>
            <WinInput value={form.company ?? ""} onChange={(e) => set("company", e.target.value)} />
          </div>
          <div className="pt-1">
            <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Vorgesetzte(r)</p>
            <div className="flex gap-2">
              <WinInput
                value={form.manager ?? ""}
                onChange={(e) => set("manager", e.target.value)}
                placeholder="CN=..."
                className="flex-1"
              />
              <WindowsButton type="button" onClick={() => set("manager", undefined)}>
                Löschen
              </WindowsButton>
            </div>
          </div>
          <div className="pt-1">
            <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Mitarbeiter:</p>
            <ul className="max-h-32 divide-y divide-slate-100 overflow-y-auto rounded-sm border border-slate-300 dark:divide-slate-800 dark:border-slate-600">
              {(user.reports ?? []).map((dn) => (
                <li key={dn} className="px-2 py-1 text-sm text-slate-700 dark:text-slate-300">
                  {dnToCn(dn)}
                </li>
              ))}
              {(user.reports ?? []).length === 0 && <li className="px-2 py-2 text-sm text-slate-400">Keine</li>}
            </ul>
          </div>
        </div>
      )}

      {tab === "memberOf" && (
        <div className="space-y-3">
          <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Mitglied von:</p>
          <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-sm border border-slate-300 dark:divide-slate-800 dark:border-slate-600">
            {form.memberOf.map((dn) => (
              <li key={dn} className="flex items-center justify-between px-2 py-1 text-sm">
                <span className="text-slate-700 dark:text-slate-300">{dnToCn(dn)}</span>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                  onClick={() => removeMemberMutation.mutate(dn)}
                >
                  Entfernen
                </button>
              </li>
            ))}
            {form.memberOf.length === 0 && <li className="px-2 py-2 text-sm text-slate-400">Keine Gruppenmitgliedschaften</li>}
          </ul>
          <div className="flex justify-start gap-2">
            <WindowsButton type="button" onClick={() => setShowGroupPicker(true)}>
              Hinzufügen…
            </WindowsButton>
          </div>
          <div className="border-t border-slate-200 pt-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            <p>
              Primäre Gruppe: <span className="font-medium text-slate-800 dark:text-slate-200">Domänen-Benutzer</span>
            </p>
          </div>
        </div>
      )}

      {showGroupPicker && (
        <ObjectPickerDialog
          title="Gruppen auswählen"
          type="group"
          onSelect={handleGroupsSelected}
          onClose={() => setShowGroupPicker(false)}
        />
      )}
    </WindowsDialog>
  );
}
