import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, IniFilePreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";

const ACTION_LABELS: Record<IniFilePreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

function IniFileDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: IniFilePreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [action, setAction] = useState<IniFilePreference["action"]>(item?.action ?? "U");
  const [filePath, setFilePath] = useState(item?.path ?? "");
  const [section, setSection] = useState(item?.section ?? "");
  const [property, setProperty] = useState(item?.property ?? "");
  const [value, setValue] = useState(item?.value ?? "");

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/inifiles/${scope}/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/inifiles/${scope}`, body),
    onSuccess: () => {
      pushToast("success", item ? "INI-Eintrag aktualisiert." : "INI-Eintrag erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = filePath.trim().length > 0 && section.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für INI-Datei" : "Neue Eigenschaften für INI-Datei"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ action, scope, path: filePath, section, property, value })}
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as IniFilePreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Pfad und Dateiname:</WinLabel>
          <WinInput value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="%SystemDir%\\beispiel.ini" autoFocus />
        </div>
        <div>
          <WinLabel>Abschnittsname:</WinLabel>
          <WinInput value={section} onChange={(e) => setSection(e.target.value)} />
        </div>
        <div>
          <WinLabel>Eigenschaftsname:</WinLabel>
          <WinInput value={property} onChange={(e) => setProperty(e.target.value)} />
        </div>
        <div>
          <WinLabel>Eigenschaftswert:</WinLabel>
          <WinInput value={value} onChange={(e) => setValue(e.target.value)} disabled={action === "D" && property.trim().length === 0} />
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Windows-Einstellungen > INI-Dateien list view. */
export function IniFilesPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: IniFilePreference }>();
  const [editing, setEditing] = useState<{ item?: IniFilePreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-inifiles", gpo.guid, scope],
    queryFn: () => api.get<IniFilePreference[]>(`/api/gpo/${gpo.guid}/inifiles/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-inifiles", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/inifiles/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "INI-Eintrag gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: IniFilePreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "INI-Datei...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`INI-Eintrag "${menu.item!.property}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">INI-Dateien</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">INI-Einträge für {scope === "machine" ? "Computer" : "Benutzer"}.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um einen INI-Eintrag hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Datei</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Abschnitt</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Eigenschaft</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Wert</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.path}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.section}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.property}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.value}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <IniFileDialog
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
