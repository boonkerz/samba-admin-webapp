import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AdComputer, UpdateComputerRequest } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, type WinTab } from "../components/WindowsDialog";
import { dnToCn } from "./dnPath";
import { ObjectPickerDialog } from "./ObjectPickerDialog";

const TABS: WinTab[] = [
  { id: "general", label: "Allgemein" },
  { id: "os", label: "Betriebssystem" },
  { id: "memberOf", label: "Mitglied von" },
  { id: "managedBy", label: "Verwaltet von" },
];

export function ComputerPropertiesDialog({
  computer,
  onClose,
  onChanged,
}: {
  computer: AdComputer;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState<AdComputer>(computer);
  const [dirty, setDirty] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  function set<K extends keyof AdComputer>(key: K, value: AdComputer[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: UpdateComputerRequest = { description: form.description, managedBy: form.managedBy };
      return api.patch<AdComputer>(`/api/directory/computers/${encodeDn(computer.dn)}`, payload);
    },
    onSuccess: () => {
      pushToast("success", "Änderungen gespeichert.");
      setDirty(false);
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const addMemberMutation = useMutation({
    mutationFn: (groupDn: string) => api.post(`/api/directory/groups/${encodeDn(groupDn)}/members`, { memberDn: computer.dn }),
    onSuccess: (_data, groupDn) => {
      setForm((f) => (f.memberOf.includes(groupDn) ? f : { ...f, memberOf: [...f.memberOf, groupDn] }));
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (groupDn: string) => api.delete(`/api/directory/groups/${encodeDn(groupDn)}/members/${encodeDn(computer.dn)}`),
    onSuccess: (_data, groupDn) => {
      pushToast("success", "Aus Gruppe entfernt.");
      setForm((f) => ({ ...f, memberOf: f.memberOf.filter((g) => g !== groupDn) }));
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handleGroupsSelected(groups: { dn: string; name: string }[]) {
    setShowGroupPicker(false);
    for (const group of groups) addMemberMutation.mutate(group.dn);
    pushToast("success", groups.length === 1 ? `Zu "${groups[0].name}" hinzugefügt.` : `Zu ${groups.length} Gruppen hinzugefügt.`);
  }

  function handleOk() {
    saveMutation.mutate(undefined, { onSuccess: onClose });
  }

  return (
    <WindowsDialog
      title={`Eigenschaften von ${computer.name}`}
      onClose={onClose}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
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
            <span className="text-3xl">🖥️</span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{computer.name}</span>
          </div>
          <div>
            <WinLabel>Computername (Prä-Windows 2000):</WinLabel>
            <WinInput value={computer.sAMAccountName.replace(/\$$/, "")} disabled />
          </div>
          <div>
            <WinLabel>DNS-Name:</WinLabel>
            <WinInput value={computer.dNSHostName ?? ""} disabled />
          </div>
          <div>
            <WinLabel>Domänencontrollertyp:</WinLabel>
            <WinInput value="Arbeitsstation oder Server" disabled />
          </div>
          <div>
            <WinLabel>Status:</WinLabel>
            <WinInput value={computer.enabled ? "Aktiviert" : "Deaktiviert"} disabled />
          </div>
          <div>
            <WinLabel>Beschreibung:</WinLabel>
            <WinInput value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "os" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Name:</WinLabel>
            <WinInput value={computer.operatingSystem ?? ""} disabled />
          </div>
          <div>
            <WinLabel>Version:</WinLabel>
            <WinInput value={computer.operatingSystemVersion ?? ""} disabled />
          </div>
          <div>
            <WinLabel>Service Pack:</WinLabel>
            <WinInput value={computer.operatingSystemServicePack ?? ""} disabled />
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
              Primäre Gruppe: <span className="font-medium text-slate-800 dark:text-slate-200">Domänencomputer</span>
            </p>
          </div>
        </div>
      )}

      {tab === "managedBy" && (
        <div className="space-y-3">
          <div>
            <WinLabel>Name:</WinLabel>
            <div className="flex gap-2">
              <WinInput value={form.managedBy ? dnToCn(form.managedBy) : ""} disabled className="flex-1" />
              <WindowsButton type="button" onClick={() => setShowManagerPicker(true)}>
                Ändern…
              </WindowsButton>
              <WindowsButton type="button" onClick={() => set("managedBy", undefined)} disabled={!form.managedBy}>
                Löschen
              </WindowsButton>
            </div>
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

      {showManagerPicker && (
        <ObjectPickerDialog
          title="Benutzer oder Gruppe auswählen"
          type="user"
          multiple={false}
          onSelect={(selected) => {
            setShowManagerPicker(false);
            if (selected[0]) set("managedBy", selected[0].dn);
          }}
          onClose={() => setShowManagerPicker(false)}
        />
      )}
    </WindowsDialog>
  );
}
