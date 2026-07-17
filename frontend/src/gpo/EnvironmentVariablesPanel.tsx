import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, EnvironmentVariablePreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const ACTION_LABELS: Record<EnvironmentVariablePreference["action"], string> = {
  C: "Erstellen",
  R: "Ersetzen",
  U: "Aktualisieren",
  D: "Löschen",
};

function EnvironmentVariableDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: EnvironmentVariablePreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [action, setAction] = useState<EnvironmentVariablePreference["action"]>(item?.action ?? "U");
  const [name, setName] = useState(item?.name ?? "");
  const [value, setValue] = useState(item?.value ?? "");
  const [userVariable, setUserVariable] = useState(item?.userVariable ?? scope === "user");
  const [partial, setPartial] = useState(item?.partial ?? false);

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/envvars/${scope}/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/envvars/${scope}`, body),
    onSuccess: () => {
      pushToast("success", item ? "Umgebungsvariable aktualisiert." : "Umgebungsvariable erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = name.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Umgebungsvariable" : "Neue Eigenschaften für Umgebungsvariable"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ action, scope, name, value, userVariable, partial })}
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as EnvironmentVariablePreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Variable ist:</WinLabel>
          <WinSelect value={userVariable ? "user" : "system"} onChange={(e) => setUserVariable(e.target.value === "user")}>
            <option value="user">Benutzervariable</option>
            <option value="system">Systemvariable</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Wert:</WinLabel>
          <WinInput value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <WinCheckbox
          label="An vorhandenen Wert im übergeordneten Prozess anhängen"
          checked={partial}
          onChange={(e) => setPartial(e.target.checked)}
        />
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Windows-Einstellungen > Umgebungsvariablen list view. */
export function EnvironmentVariablesPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: EnvironmentVariablePreference }>();
  const [editing, setEditing] = useState<{ item?: EnvironmentVariablePreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-envvars", gpo.guid, scope],
    queryFn: () => api.get<EnvironmentVariablePreference[]>(`/api/gpo/${gpo.guid}/envvars/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-envvars", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/envvars/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Umgebungsvariable gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: EnvironmentVariablePreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Umgebungsvariable...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Umgebungsvariable "${menu.item!.name}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Umgebungsvariablen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Umgebungsvariablen für {scope === "machine" ? "Computer" : "Benutzer"}.
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um eine Variable hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Wert</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.name}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.value}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.userVariable ? "Benutzer" : "System"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <EnvironmentVariableDialog
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
