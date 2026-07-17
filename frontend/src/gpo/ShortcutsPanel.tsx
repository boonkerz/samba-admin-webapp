import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, ShortcutPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";

const ACTION_LABELS: Record<ShortcutPreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

const LOCATION_OPTIONS = [
  { value: "%DesktopDir%", label: "Desktop" },
  { value: "%StartMenuDir%", label: "Startmenü" },
  { value: "%StartUpDir%", label: "Autostart" },
  { value: "%QuickLaunchDir%", label: "Schnellstartleiste" },
  { value: "%FavoritesDir%", label: "Favoriten" },
];

function ShortcutDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: ShortcutPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [action, setAction] = useState<ShortcutPreference["action"]>(item?.action ?? "U");
  const [name, setName] = useState(item?.name ?? "");
  const [location, setLocation] = useState(item?.location ?? "%DesktopDir%");
  const [targetPath, setTargetPath] = useState(item?.targetPath ?? "");
  const [args, setArgs] = useState(item?.arguments ?? "");
  const [startIn, setStartIn] = useState(item?.startIn ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const [iconPath, setIconPath] = useState(item?.iconPath ?? "");
  const [iconIndex, setIconIndex] = useState(item?.iconIndex ?? 0);
  const [window, setWindow] = useState<ShortcutPreference["window"]>(item?.window ?? "");

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/shortcuts/${scope}/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/shortcuts/${scope}`, body),
    onSuccess: () => {
      pushToast("success", item ? "Verknüpfung aktualisiert." : "Verknüpfung erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = name.trim().length > 0 && targetPath.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Verknüpfung" : "Neue Eigenschaften für Verknüpfung"}
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
                scope,
                name,
                location,
                targetPath,
                arguments: args || undefined,
                startIn: startIn || undefined,
                comment: comment || undefined,
                iconPath: iconPath || undefined,
                iconIndex,
                window,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as ShortcutPreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Speicherort:</WinLabel>
          <WinSelect value={location} onChange={(e) => setLocation(e.target.value)}>
            {LOCATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Zielpfad:</WinLabel>
          <WinInput value={targetPath} onChange={(e) => setTargetPath(e.target.value)} />
        </div>
        <div>
          <WinLabel>Argumente hinzufügen (optional):</WinLabel>
          <WinInput value={args} onChange={(e) => setArgs(e.target.value)} />
        </div>
        <div>
          <WinLabel>Starten in (optional):</WinLabel>
          <WinInput value={startIn} onChange={(e) => setStartIn(e.target.value)} />
        </div>
        <div>
          <WinLabel>Kommentar (optional):</WinLabel>
          <WinInput value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div>
          <WinLabel>Symbolpfad (optional):</WinLabel>
          <WinInput value={iconPath} onChange={(e) => setIconPath(e.target.value)} />
        </div>
        <div>
          <WinLabel>Symbolindex:</WinLabel>
          <WinInput type="number" value={iconIndex} onChange={(e) => setIconIndex(Number(e.target.value) || 0)} />
        </div>
        <div>
          <WinLabel>Fenstertyp:</WinLabel>
          <WinSelect value={window} onChange={(e) => setWindow(e.target.value as ShortcutPreference["window"])}>
            <option value="">Normales Fenster</option>
            <option value="3">Maximiert</option>
            <option value="7">Minimiert</option>
          </WinSelect>
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Windows-Einstellungen > Verknüpfungen list view. */
export function ShortcutsPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: ShortcutPreference }>();
  const [editing, setEditing] = useState<{ item?: ShortcutPreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-shortcuts", gpo.guid, scope],
    queryFn: () => api.get<ShortcutPreference[]>(`/api/gpo/${gpo.guid}/shortcuts/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-shortcuts", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/shortcuts/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Verknüpfung gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: ShortcutPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Verknüpfung...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Verknüpfung "${menu.item!.name}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Verknüpfungen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Verknüpfungen für {scope === "machine" ? "Computer" : "Benutzer"}.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um eine Verknüpfung hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Speicherort</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Ziel</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{LOCATION_OPTIONS.find((o) => o.value === item.location)?.label ?? item.location}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.targetPath}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <ShortcutDialog
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
