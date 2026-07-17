import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryObjectSummary } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { Button } from "../components/Button";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { useToastStore } from "../state/toastStore";
import { TreeIcon } from "./TreeIcon";
import { ResetPasswordDialog } from "./UserForm";
import { RenameComputerDialog } from "./ComputerActions";

const TYPE_LABEL: Record<DirectoryObjectSummary["type"], string> = {
  domain: "Domäne",
  ou: "OU",
  container: "Container",
  user: "Benutzer",
  group: "Gruppe",
  computer: "Computer",
};

function kindPathFor(type: DirectoryObjectSummary["type"]): string {
  return type === "user" ? "users" : type === "group" ? "groups" : type === "computer" ? "computers" : "ous";
}

export function ObjectList({
  parentDn,
  onOpenObject,
  onNew,
  onMove,
}: {
  parentDn: string;
  onOpenObject: (obj: DirectoryObjectSummary) => void;
  onNew: (type: "user" | "group" | "ou") => void;
  onMove: (obj: DirectoryObjectSummary) => void;
}) {
  const [selected, setSelected] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; obj?: DirectoryObjectSummary }>();
  const [resetPasswordFor, setResetPasswordFor] = useState<DirectoryObjectSummary>();
  const [renameComputerFor, setRenameComputerFor] = useState<DirectoryObjectSummary>();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const objectsQuery = useQuery({
    queryKey: ["objects", parentDn],
    queryFn: () => api.get<DirectoryObjectSummary[]>(`/api/directory/objects?parentDn=${encodeDn(parentDn)}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["objects", parentDn] });

  const deleteMutation = useMutation({
    mutationFn: (obj: DirectoryObjectSummary) => api.delete(`/api/directory/${kindPathFor(obj.type)}/${encodeDn(obj.dn)}`),
    onSuccess: () => {
      pushToast("success", "Objekt gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: (obj: DirectoryObjectSummary) =>
      api.post(`/api/directory/${kindPathFor(obj.type)}/${encodeDn(obj.dn)}/${obj.enabled ? "disable" : "enable"}`),
    onSuccess: (_data, obj) => {
      pushToast("success", obj.enabled ? "Deaktiviert." : "Aktiviert.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const objects = objectsQuery.data ?? [];
  const selectedObj = objects.find((o) => o.dn === selected);

  function rowMenuEntries(obj: DirectoryObjectSummary): ContextMenuEntry[] {
    const entries: ContextMenuEntry[] = [
      { label: "Öffnen", onClick: () => onOpenObject(obj) },
      { label: "Verschieben…", onClick: () => onMove(obj) },
    ];
    if (obj.type === "user" || obj.type === "computer") {
      entries.push({ separator: true });
      entries.push({
        label: obj.enabled ? "Deaktivieren" : "Aktivieren",
        onClick: () => toggleEnabledMutation.mutate(obj),
      });
    }
    if (obj.type === "user") {
      entries.push({ label: "Kennwort zurücksetzen…", onClick: () => setResetPasswordFor(obj) });
    }
    if (obj.type === "computer") {
      entries.push({ label: "Umbenennen…", onClick: () => setRenameComputerFor(obj) });
    }
    entries.push({ separator: true });
    entries.push({
      label: "Löschen",
      danger: true,
      onClick: () => {
        if (confirm(`"${obj.name}" wirklich löschen?`)) deleteMutation.mutate(obj);
      },
    });
    return entries;
  }

  const emptyAreaEntries: ContextMenuEntry[] = [
    {
      label: "Neu",
      children: [
        { label: "Benutzer…", onClick: () => onNew("user") },
        { label: "Gruppe…", onClick: () => onNew("group") },
        { label: "Organisationseinheit…", onClick: () => onNew("ou") },
      ],
    },
    { separator: true },
    { label: "Aktualisieren", onClick: () => objectsQuery.refetch() },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <Button variant="secondary" onClick={() => onNew("user")}>+ Benutzer</Button>
        <Button variant="secondary" onClick={() => onNew("group")}>+ Gruppe</Button>
        <Button variant="secondary" onClick={() => onNew("ou")}>+ OU</Button>
        <div className="flex-1" />
        {selectedObj && (
          <>
            <Button variant="secondary" onClick={() => onMove(selectedObj)}>Verschieben</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`"${selectedObj.name}" wirklich löschen?`)) deleteMutation.mutate(selectedObj);
              }}
            >
              Löschen
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={() => objectsQuery.refetch()}>⟳</Button>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        onContextMenu={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Beschreibung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {objects.map((obj) => (
              <tr
                key={obj.dn}
                onClick={() => setSelected(obj.dn)}
                onDoubleClick={() => onOpenObject(obj)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelected(obj.dn);
                  setMenu({ x: e.clientX, y: e.clientY, obj });
                }}
                className={`cursor-pointer ${selected === obj.dn ? "bg-indigo-50 dark:bg-indigo-950" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
              >
                <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                  <div className="flex items-center gap-2">
                    <TreeIcon type={obj.type} />
                    {obj.name}
                  </div>
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{TYPE_LABEL[obj.type]}</td>
                <td className="px-3 py-2">
                  {obj.enabled === undefined ? (
                    <span className="text-slate-400">–</span>
                  ) : obj.enabled ? (
                    <span className="text-emerald-600">Aktiv</span>
                  ) : (
                    <span className="text-amber-600">Deaktiviert</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{obj.description ?? ""}</td>
              </tr>
            ))}
            {objects.length === 0 && !objectsQuery.isLoading && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-slate-400"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY });
                  }}
                >
                  Keine Objekte in diesem Container.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={menu.obj ? rowMenuEntries(menu.obj) : emptyAreaEntries}
          onClose={() => setMenu(undefined)}
        />
      )}

      {resetPasswordFor && (
        <ResetPasswordDialog
          userDn={resetPasswordFor.dn}
          userName={resetPasswordFor.name}
          onClose={() => setResetPasswordFor(undefined)}
        />
      )}

      {renameComputerFor && (
        <RenameComputerDialog
          computerDn={renameComputerFor.dn}
          currentName={renameComputerFor.name}
          onClose={() => setRenameComputerFor(undefined)}
          onRenamed={invalidate}
        />
      )}
    </div>
  );
}
