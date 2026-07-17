import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, DataSourcePreference, DataSourceAttribute } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";

const ACTION_LABELS: Record<DataSourcePreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

function DataSourceDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: DataSourcePreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [action, setAction] = useState<DataSourcePreference["action"]>(item?.action ?? "U");
  const [userDSN, setUserDSN] = useState(item?.userDSN ?? true);
  const [dsn, setDsn] = useState(item?.dsn ?? "");
  const [driver, setDriver] = useState(item?.driver ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [username, setUsername] = useState(item?.username ?? "");
  const [attributes, setAttributes] = useState<DataSourceAttribute[]>(item?.attributes ?? []);

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/datasources/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/datasources`, body),
    onSuccess: () => {
      pushToast("success", item ? "Datenquelle aktualisiert." : "Datenquelle erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = dsn.trim().length > 0 && driver.trim().length > 0;

  function updateAttr(idx: number, field: "name" | "value", value: string) {
    setAttributes((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  }

  function removeAttr(idx: number) {
    setAttributes((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Datenquelle" : "Neue Eigenschaften für Datenquelle"}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                action,
                userDSN,
                dsn,
                driver,
                description: description || undefined,
                username: username || undefined,
                attributes,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as DataSourcePreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Benutzer-DSN oder System-DSN:</WinLabel>
          <WinSelect value={userDSN ? "user" : "system"} onChange={(e) => setUserDSN(e.target.value === "user")}>
            <option value="user">Benutzer-DSN (nur aktueller Benutzer)</option>
            <option value="system">System-DSN (alle Benutzer)</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Datenquellenname (DSN):</WinLabel>
          <WinInput value={dsn} onChange={(e) => setDsn(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Treiber:</WinLabel>
          <WinInput value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Microsoft Access Driver (*.mdb, *.accdb)" />
        </div>
        <div>
          <WinLabel>Beschreibung (optional):</WinLabel>
          <WinInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <WinLabel>Benutzername (optional):</WinLabel>
          <WinInput value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <WinLabel>Treiberspezifische Attribute:</WinLabel>
            <button
              type="button"
              className="text-xs text-[#1c6bb4] hover:underline"
              onClick={() => setAttributes((prev) => [...prev, { name: "", value: "" }])}
            >
              + Hinzufügen
            </button>
          </div>
          <div className="space-y-2">
            {attributes.map((a, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <WinInput placeholder="Name" value={a.name} onChange={(e) => updateAttr(idx, "name", e.target.value)} />
                <WinInput placeholder="Wert" value={a.value} onChange={(e) => updateAttr(idx, "value", e.target.value)} />
                <button type="button" className="shrink-0 text-xs text-red-600 hover:underline" onClick={() => removeAttr(idx)}>
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Datenquellen list view. */
export function DataSourcesPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: DataSourcePreference }>();
  const [editing, setEditing] = useState<{ item?: DataSourcePreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-datasources", gpo.guid],
    queryFn: () => api.get<DataSourcePreference[]>(`/api/gpo/${gpo.guid}/datasources`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-datasources", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/datasources/${uid}`),
    onSuccess: () => {
      pushToast("success", "Datenquelle gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: DataSourcePreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Datenquelle...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Datenquelle "${menu.item!.dsn}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Datenquellen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">ODBC-Datenquellen für Benutzer.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um eine Datenquelle hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">DSN</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Treiber</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.dsn}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.userDSN ? "Benutzer-DSN" : "System-DSN"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.driver}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <DataSourceDialog
          gpo={gpo}
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
