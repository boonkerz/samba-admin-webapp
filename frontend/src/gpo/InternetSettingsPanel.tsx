import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, InternetSettingsPreference, InternetSettingsRegEntry } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const KIND_LABELS: Record<InternetSettingsPreference["kind"], string> = {
  legacy: "Internet Explorer 5 und 6",
  modern: "Internet Explorer 7",
};

const REG_TYPE_OPTIONS: InternetSettingsRegEntry["valueType"][] = ["REG_SZ", "REG_EXPAND_SZ", "REG_BINARY", "REG_DWORD", "REG_MULTI_SZ", "REG_QWORD"];
const HIVE_OPTIONS: InternetSettingsRegEntry["hive"][] = [
  "HKEY_CURRENT_USER",
  "HKEY_LOCAL_MACHINE",
  "HKEY_CLASSES_ROOT",
  "HKEY_USERS",
  "HKEY_CURRENT_CONFIG",
];

function emptyEntry(): InternetSettingsRegEntry {
  return { id: "", hive: "HKEY_CURRENT_USER", key: "", name: "", valueType: "REG_SZ", value: "", disabled: false };
}

function InternetSettingsDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: InternetSettingsPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [kind, setKind] = useState<InternetSettingsPreference["kind"]>(item?.kind ?? "modern");
  const [bypassErrors, setBypassErrors] = useState(item?.bypassErrors ?? false);
  const [entries, setEntries] = useState<InternetSettingsRegEntry[]>(item?.entries ?? []);

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item
        ? api.put(`/api/gpo/${gpo.guid}/internetsettings/${scope}/${item.uid}`, body)
        : api.post(`/api/gpo/${gpo.guid}/internetsettings/${scope}`, body),
    onSuccess: () => {
      pushToast("success", item ? "Interneteinstellungen aktualisiert." : "Interneteinstellungen erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function updateEntry(idx: number, patch: Partial<InternetSettingsRegEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function removeEntry(idx: number) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Interneteinstellungen" : "Neue Eigenschaften für Interneteinstellungen"}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <WindowsButton variant="primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ kind, bypassErrors, entries })}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Version:</WinLabel>
          <WinSelect value={kind} onChange={(e) => setKind(e.target.value as InternetSettingsPreference["kind"])}>
            <option value="modern">{KIND_LABELS.modern}</option>
            <option value="legacy">{KIND_LABELS.legacy}</option>
          </WinSelect>
        </div>
        <WinCheckbox label="Fehler umgehen (bypassErrors)" checked={bypassErrors} onChange={(e) => setBypassErrors(e.target.checked)} />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <WinLabel>Registrierungseinträge:</WinLabel>
            <button type="button" className="text-xs text-[#1c6bb4] hover:underline" onClick={() => setEntries((prev) => [...prev, emptyEntry()])}>
              + Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {entries.map((e, idx) => (
              <div key={idx} className="space-y-1 rounded-sm border border-slate-300 p-2 dark:border-slate-700">
                <div className="grid grid-cols-2 gap-2">
                  <WinInput placeholder="ID" value={e.id} onChange={(ev) => updateEntry(idx, { id: ev.target.value })} />
                  <WinSelect value={e.hive} onChange={(ev) => updateEntry(idx, { hive: ev.target.value as InternetSettingsRegEntry["hive"] })}>
                    {HIVE_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </WinSelect>
                </div>
                <WinInput placeholder="Schlüssel" value={e.key} onChange={(ev) => updateEntry(idx, { key: ev.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <WinInput placeholder="Wertname" value={e.name} onChange={(ev) => updateEntry(idx, { name: ev.target.value })} />
                  <WinSelect
                    value={e.valueType}
                    onChange={(ev) => updateEntry(idx, { valueType: ev.target.value as InternetSettingsRegEntry["valueType"] })}
                  >
                    {REG_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </WinSelect>
                </div>
                <div className="flex items-center gap-2">
                  <WinInput placeholder="Wert" value={e.value} onChange={(ev) => updateEntry(idx, { value: ev.target.value })} />
                  <WinCheckbox label="Deaktiviert" checked={e.disabled} onChange={(ev) => updateEntry(idx, { disabled: ev.target.checked })} />
                  <button type="button" className="shrink-0 text-xs text-red-600 hover:underline" onClick={() => removeEntry(idx)}>
                    Entfernen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Interneteinstellungen list view. */
export function InternetSettingsPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: InternetSettingsPreference }>();
  const [editing, setEditing] = useState<{ kind: InternetSettingsPreference["kind"]; item?: InternetSettingsPreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-internetsettings", gpo.guid, scope],
    queryFn: () => api.get<InternetSettingsPreference[]>(`/api/gpo/${gpo.guid}/internetsettings/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-internetsettings", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/internetsettings/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Interneteinstellungen gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: InternetSettingsPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    {
      label: "Neu",
      children: [
        { label: `${KIND_LABELS.modern}...`, onClick: () => setEditing({ kind: "modern" }) },
        { label: `${KIND_LABELS.legacy}...`, onClick: () => setEditing({ kind: "legacy" }) },
      ],
    },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ kind: menu.item!.kind, item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`"${KIND_LABELS[menu.item!.kind]}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Interneteinstellungen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Interneteinstellungen für {scope === "machine" ? "Computer" : "Benutzer"}.
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um Interneteinstellungen hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Version</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Einträge</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ kind: item.kind, item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{KIND_LABELS[item.kind]}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.entries.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <InternetSettingsDialog
          gpo={gpo}
          scope={scope}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
