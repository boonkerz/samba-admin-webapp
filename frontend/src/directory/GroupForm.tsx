import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AdGroup, CreateGroupRequest } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { Button } from "../components/Button";
import { Field, TextInput } from "../components/Field";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { dnToPath } from "./dnPath";

/** Mirrors the classic ADUC "New Object - Group" dialog: name, scope, type. */
export function NewGroupDialog({ parentOuDn, onDone }: { parentOuDn: string; onDone: () => void }) {
  const [sAMAccountName, setSam] = useState("");
  const [groupScope, setGroupScope] = useState<AdGroup["groupScope"]>("global");
  const [groupType, setGroupType] = useState<AdGroup["groupType"]>("security");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const createMutation = useMutation({
    mutationFn: (req: CreateGroupRequest) => api.post("/api/directory/groups", req),
    onSuccess: () => {
      pushToast("success", "Gruppe erstellt.");
      queryClient.invalidateQueries({ queryKey: ["objects", parentOuDn] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = sAMAccountName.trim().length > 0;

  return (
    <WindowsDialog
      title="Neues Objekt - Gruppe"
      icon={<span className="text-2xl">👥</span>}
      createIn={dnToPath(parentOuDn)}
      onClose={onDone}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || createMutation.isPending}
            onClick={() => createMutation.mutate({ parentOuDn, sAMAccountName, groupType, groupScope })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Gruppenname:</WinLabel>
          <WinInput value={sAMAccountName} onChange={(e) => setSam(e.target.value)} autoFocus />
        </div>

        <div className="flex gap-6 pt-2">
          <div className="flex-1">
            <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Gruppenbereich</p>
            <div className="space-y-1">
              {(
                [
                  ["domainLocal", "Domänenlokal"],
                  ["global", "Global"],
                  ["universal", "Universal"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="groupScope"
                    checked={groupScope === value}
                    onChange={() => setGroupScope(value)}
                    className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">Gruppentyp</p>
            <div className="space-y-1">
              {(
                [
                  ["security", "Sicherheit"],
                  ["distribution", "Verteilung"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
                  <input
                    type="radio"
                    name="groupType"
                    checked={groupType === value}
                    onChange={() => setGroupType(value)}
                    className="text-[#1c6bb4] focus:ring-[#1c6bb4]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}

export function GroupDetail({ group, onChanged }: { group: AdGroup; onChanged: () => void }) {
  const [memberDn, setMemberDn] = useState("");
  const pushToast = useToastStore((s) => s.push);

  const addMember = useMutation({
    mutationFn: () => api.post(`/api/directory/groups/${encodeDn(group.dn)}/members`, { memberDn }),
    onSuccess: () => {
      pushToast("success", "Mitglied hinzugefügt.");
      setMemberDn("");
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeMember = useMutation({
    mutationFn: (dn: string) => api.delete(`/api/directory/groups/${encodeDn(group.dn)}/members/${encodeDn(dn)}`),
    onSuccess: () => {
      pushToast("success", "Mitglied entfernt.");
      onChanged();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Bereich</dt>
        <dd className="col-span-2 text-slate-900 dark:text-slate-100">{group.groupScope}</dd>
        <dt className="text-slate-500">Typ</dt>
        <dd className="col-span-2 text-slate-900 dark:text-slate-100">{group.groupType}</dd>
      </dl>

      <div>
        <h3 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Mitglieder ({group.members.length})</h3>
        <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-md ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-700">
          {group.members.map((m) => (
            <li key={m} className="flex items-center justify-between px-2 py-1 text-xs">
              <span className="truncate text-slate-700 dark:text-slate-300">{m}</span>
              <button className="text-red-500 hover:underline" onClick={() => removeMember.mutate(m)}>
                entfernen
              </button>
            </li>
          ))}
          {group.members.length === 0 && <li className="px-2 py-2 text-xs text-slate-400">Keine Mitglieder</li>}
        </ul>
      </div>

      <Field label="Mitglied hinzufügen (Distinguished Name)">
        <div className="flex gap-2">
          <TextInput value={memberDn} onChange={(e) => setMemberDn(e.target.value)} placeholder="CN=..." />
          <Button variant="secondary" onClick={() => addMember.mutate()} disabled={!memberDn}>
            Hinzufügen
          </Button>
        </div>
      </Field>
    </div>
  );
}
