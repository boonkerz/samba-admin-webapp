import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectoryObjectSummary, DirectoryObjectType } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";
import { dnToPath } from "./dnPath";

const TYPE_OPTIONS: { value: DirectoryObjectType | ""; label: string }[] = [
  { value: "", label: "Benutzer, Kontakte, Gruppen und Computer" },
  { value: "user", label: "Benutzer" },
  { value: "group", label: "Gruppen" },
  { value: "computer", label: "Computer" },
  { value: "ou", label: "Organisationseinheiten" },
];

const TYPE_LABEL: Record<DirectoryObjectType, string> = {
  domain: "Domäne",
  ou: "Organisationseinheit",
  container: "Container",
  user: "Benutzer",
  group: "Gruppe",
  computer: "Computer",
};

/** Mirrors real ADUC's "Suchen" (Find) dialog — domain-wide object search reachable from any OU's context menu. */
export function FindObjectsDialog({
  baseDnLabel,
  onOpenObject,
  onClose,
}: {
  baseDnLabel: string;
  onOpenObject: (obj: DirectoryObjectSummary) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DirectoryObjectType | "">("");

  const searchQuery = useQuery({
    queryKey: ["find-objects-search", type, query],
    queryFn: () => api.get<DirectoryObjectSummary[]>(`/api/directory/search?q=${encodeURIComponent(query)}${type ? `&type=${type}` : ""}`),
    enabled: false,
  });

  return (
    <WindowsDialog
      title="Suchen"
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={
        <WindowsButton type="button" onClick={onClose}>
          Schließen
        </WindowsButton>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Suchen in:</WinLabel>
          <WinInput value={baseDnLabel} disabled />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-64">
            <WinLabel>Typ:</WinLabel>
            <WinSelect value={type} onChange={(e) => setType(e.target.value as DirectoryObjectType | "")}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </WinSelect>
          </div>
          <div className="flex-1">
            <WinLabel>Name:</WinLabel>
            <WinInput value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchQuery.refetch()} autoFocus />
          </div>
          <WindowsButton type="button" onClick={() => searchQuery.refetch()}>
            Jetzt suchen
          </WindowsButton>
        </div>

        <div>
          <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">Suchergebnisse (Doppelklick zum Öffnen):</p>
          <div className="max-h-96 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Typ</th>
                  <th className="px-2 py-1">Beschreibung</th>
                  <th className="px-2 py-1">Ordner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(searchQuery.data ?? []).map((obj) => (
                  <tr
                    key={obj.dn}
                    onDoubleClick={() => onOpenObject(obj)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td className="px-2 py-1 text-slate-800 dark:text-slate-100">{obj.name}</td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{TYPE_LABEL[obj.type]}</td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{obj.description ?? ""}</td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{dnToPath(obj.dn.slice(obj.dn.indexOf(",") + 1))}</td>
                  </tr>
                ))}
                {searchQuery.isFetched && (searchQuery.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                      Keine Ergebnisse.
                    </td>
                  </tr>
                )}
                {!searchQuery.isFetched && (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                      "Jetzt suchen" klicken, um Ergebnisse anzuzeigen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}
