import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, NetworkSharePreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const ACTION_LABELS: Record<NetworkSharePreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

function NetworkShareDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: NetworkSharePreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const [action, setAction] = useState<NetworkSharePreference["action"]>(item?.action ?? "U");
  const [name, setName] = useState(item?.name ?? "");
  const [sharePath, setSharePath] = useState(item?.path ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const [allRegular, setAllRegular] = useState(item?.allRegular ?? false);
  const [allHidden, setAllHidden] = useState(item?.allHidden ?? false);
  const [allAdminDrive, setAllAdminDrive] = useState(item?.allAdminDrive ?? false);
  const [limitUsers, setLimitUsers] = useState<NetworkSharePreference["limitUsers"]>(item?.limitUsers ?? "NO_CHANGE");
  const [userLimit, setUserLimit] = useState(item?.userLimit ?? 0);
  const [abe, setAbe] = useState<NetworkSharePreference["abe"]>(item?.abe ?? "NO_CHANGE");

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      item ? api.put(`/api/gpo/${gpo.guid}/networkshares/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/networkshares`, body),
    onSuccess: () => {
      pushToast("success", item ? "Netzwerkfreigabe aktualisiert." : "Netzwerkfreigabe erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = name.trim().length > 0 && sharePath.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Netzwerkfreigabe" : "Neue Eigenschaften für Netzwerkfreigabe"}
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
                name,
                path: sharePath,
                comment: comment || undefined,
                allRegular,
                allHidden,
                allAdminDrive,
                limitUsers,
                userLimit: limitUsers === "SET_LIMIT" ? userLimit : undefined,
                abe,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as NetworkSharePreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Freigabename:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Pfad:</WinLabel>
          <WinInput value={sharePath} onChange={(e) => setSharePath(e.target.value)} placeholder="C:\Freigaben\Produkte" />
        </div>
        <div>
          <WinLabel>Kommentar (optional):</WinLabel>
          <WinInput value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <div>
          <WinLabel>Zugriffsbasierte Aufzählung (ABE):</WinLabel>
          <WinSelect value={abe} onChange={(e) => setAbe(e.target.value as NetworkSharePreference["abe"])}>
            <option value="NO_CHANGE">Nicht ändern</option>
            <option value="ENABLE">Aktivieren</option>
            <option value="DISABLE">Deaktivieren</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Benutzeranzahl begrenzen:</WinLabel>
          <WinSelect value={limitUsers} onChange={(e) => setLimitUsers(e.target.value as NetworkSharePreference["limitUsers"])}>
            <option value="NO_CHANGE">Nicht ändern</option>
            <option value="MAX_ALLOWED">Maximal zulässig</option>
            <option value="SET_LIMIT">Begrenzt auf</option>
          </WinSelect>
        </div>
        {limitUsers === "SET_LIMIT" && (
          <div>
            <WinLabel>Anzahl Benutzer:</WinLabel>
            <WinInput type="number" min={1} value={userLimit} onChange={(e) => setUserLimit(Number(e.target.value) || 0)} />
          </div>
        )}
        <WinCheckbox
          label="Alle regulären Freigaben (nicht ausgeblendet/speziell)"
          checked={allRegular}
          onChange={(e) => setAllRegular(e.target.checked)}
        />
        <WinCheckbox label="Alle ausgeblendeten Freigaben" checked={allHidden} onChange={(e) => setAllHidden(e.target.checked)} />
        <WinCheckbox
          label="Alle administrativen Laufwerksfreigaben (z. B. C$)"
          checked={allAdminDrive}
          onChange={(e) => setAllAdminDrive(e.target.checked)}
        />
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Windows-Einstellungen > Netzwerkfreigaben list view. */
export function NetworkSharesPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: NetworkSharePreference }>();
  const [editing, setEditing] = useState<{ item?: NetworkSharePreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-networkshares", gpo.guid],
    queryFn: () => api.get<NetworkSharePreference[]>(`/api/gpo/${gpo.guid}/networkshares`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-networkshares", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/networkshares/${uid}`),
    onSuccess: () => {
      pushToast("success", "Netzwerkfreigabe gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: NetworkSharePreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Netzwerkfreigabe...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Netzwerkfreigabe "${menu.item!.name}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Netzwerkfreigaben</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Freigaben für den Computer.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um eine Netzwerkfreigabe hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Pfad</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.path}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <NetworkShareDialog
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
