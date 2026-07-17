import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, LocalUserGroupPreference, LocalUserPreference, LocalGroupPreference, LocalGroupMember } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const ACTION_LABELS: Record<LocalUserGroupPreference["action"], string> = { C: "Erstellen", R: "Ersetzen", U: "Aktualisieren", D: "Löschen" };

function displayName(item: LocalUserGroupPreference): string {
  return item.kind === "user" ? item.userName : item.groupName;
}

function useSaveLocalUserGroup(gpo: GpoObject, scope: "machine" | "user", uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid
        ? api.put(`/api/gpo/${gpo.guid}/localgroups/${scope}/${uid}`, body)
        : api.post(`/api/gpo/${gpo.guid}/localgroups/${scope}`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Eintrag aktualisiert." : "Eintrag erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Neue Eigenschaften für lokalen Benutzer" dialog. No password field — see backend service doc comment (MS14-025). */
function LocalUserDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: LocalUserPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<LocalUserPreference["action"]>(item?.action ?? "U");
  const [userName, setUserName] = useState(item?.userName ?? "");
  const [newName, setNewName] = useState(item?.newName ?? "");
  const [fullName, setFullName] = useState(item?.fullName ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [changeLogon, setChangeLogon] = useState(item?.changeLogon ?? true);
  const [noChange, setNoChange] = useState(item?.noChange ?? false);
  const [neverExpires, setNeverExpires] = useState(item?.neverExpires ?? false);
  const [acctDisabled, setAcctDisabled] = useState(item?.acctDisabled ?? false);
  const saveMutation = useSaveLocalUserGroup(gpo, scope, item?.uid, onSaved);

  const valid = userName.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für lokalen Benutzer" : "Neue Eigenschaften für lokalen Benutzer"}
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                kind: "user",
                action,
                scope,
                userName,
                newName: newName || undefined,
                fullName: fullName || undefined,
                description: description || undefined,
                changeLogon,
                noChange,
                neverExpires,
                acctDisabled,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as LocalUserPreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Benutzername:</WinLabel>
          <WinInput value={userName} onChange={(e) => setUserName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Umbenennen in (optional):</WinLabel>
          <WinInput value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div>
          <WinLabel>Vollständiger Name:</WinLabel>
          <WinInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <WinLabel>Beschreibung:</WinLabel>
          <WinInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <WinCheckbox label="Benutzer muss Kennwort bei der nächsten Anmeldung ändern" checked={changeLogon} onChange={(e) => setChangeLogon(e.target.checked)} />
        <WinCheckbox label="Benutzer kann Kennwort nicht ändern" checked={noChange} onChange={(e) => setNoChange(e.target.checked)} />
        <WinCheckbox label="Kennwort läuft nie ab" checked={neverExpires} onChange={(e) => setNeverExpires(e.target.checked)} />
        <WinCheckbox label="Konto ist deaktiviert" checked={acctDisabled} onChange={(e) => setAcctDisabled(e.target.checked)} />
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Neue Eigenschaften für lokale Gruppe" dialog. */
function LocalGroupDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: LocalGroupPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<LocalGroupPreference["action"]>(item?.action ?? "U");
  const [groupName, setGroupName] = useState(item?.groupName ?? "");
  const [newName, setNewName] = useState(item?.newName ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [deleteAllUsers, setDeleteAllUsers] = useState(item?.deleteAllUsers ?? false);
  const [deleteAllGroups, setDeleteAllGroups] = useState(item?.deleteAllGroups ?? false);
  const [members, setMembers] = useState<LocalGroupMember[]>(item?.members ?? []);
  const [memberName, setMemberName] = useState("");
  const saveMutation = useSaveLocalUserGroup(gpo, scope, item?.uid, onSaved);

  const valid = groupName.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für lokale Gruppe" : "Neue Eigenschaften für lokale Gruppe"}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                kind: "group",
                action,
                scope,
                groupName,
                newName: newName || undefined,
                description: description || undefined,
                deleteAllUsers,
                deleteAllGroups,
                members,
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
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as LocalGroupPreference["action"])}>
            <option value="C">Erstellen</option>
            <option value="R">Ersetzen</option>
            <option value="U">Aktualisieren</option>
            <option value="D">Löschen</option>
          </WinSelect>
        </div>
        <div>
          <WinLabel>Gruppenname:</WinLabel>
          <WinInput value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Umbenennen in (optional):</WinLabel>
          <WinInput value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div>
          <WinLabel>Beschreibung:</WinLabel>
          <WinInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <WinCheckbox label="Alle Benutzermitglieder entfernen" checked={deleteAllUsers} onChange={(e) => setDeleteAllUsers(e.target.checked)} />
        <WinCheckbox label="Alle Gruppenmitglieder entfernen" checked={deleteAllGroups} onChange={(e) => setDeleteAllGroups(e.target.checked)} />

        <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
          <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Mitglieder dieser Gruppe</legend>
          <div className="space-y-2">
            {members.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-slate-700 dark:text-slate-300">
                  {m.action === "ADD" ? "+" : "−"} {m.name}
                </span>
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setMembers(members.filter((_, j) => j !== i))}>
                  Entfernen
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <WinInput value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="domäne\benutzer" />
              <WindowsButton
                onClick={() => {
                  if (memberName.trim()) {
                    setMembers([...members, { name: memberName.trim(), action: "ADD" }]);
                    setMemberName("");
                  }
                }}
              >
                Hinzufügen
              </WindowsButton>
            </div>
          </div>
        </fieldset>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Lokale Benutzer und Gruppen list view. */
export function LocalUserGroupsPanel({ gpo, scope }: { gpo: GpoObject; scope: "machine" | "user" }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: LocalUserGroupPreference }>();
  const [editing, setEditing] = useState<{ kind: "user" | "group"; item?: LocalUserGroupPreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-localgroups", gpo.guid, scope],
    queryFn: () => api.get<LocalUserGroupPreference[]>(`/api/gpo/${gpo.guid}/localgroups/${scope}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-localgroups", gpo.guid, scope] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/localgroups/${scope}/${uid}`),
    onSuccess: () => {
      pushToast("success", "Eintrag gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: LocalUserGroupPreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    {
      label: "Neu",
      children: [
        { label: "Lokaler Benutzer...", onClick: () => setEditing({ kind: "user" }) },
        { label: "Lokale Gruppe...", onClick: () => setEditing({ kind: "group" }) },
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
              if (confirm(`"${displayName(menu.item!)}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Lokale Benutzer und Gruppen</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Für {scope === "machine" ? "Computer" : "Benutzer"} bereitgestellt.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">
            Rechtsklick → Neu, um einen Benutzer oder eine Gruppe hinzuzufügen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Aktion</th>
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
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{displayName(item)}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.kind === "user" ? "Benutzer" : "Gruppe"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{ACTION_LABELS[item.action]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing?.kind === "user" && (
        <LocalUserDialog
          gpo={gpo}
          scope={scope}
          item={editing.item as LocalUserPreference | undefined}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === "group" && (
        <LocalGroupDialog
          gpo={gpo}
          scope={scope}
          item={editing.item as LocalGroupPreference | undefined}
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
