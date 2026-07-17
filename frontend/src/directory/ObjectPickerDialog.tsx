import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectoryObjectSummary, DirectoryObjectType, SetupSummary } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { dnToPath } from "./dnPath";

const TYPE_OBJECT_LABEL: Record<DirectoryObjectType, string> = {
  domain: "Domäne",
  ou: "Organisationseinheiten",
  container: "Container",
  user: "Benutzer",
  group: "Gruppen oder Integrierte Sicherheitsprinzipale",
  computer: "Computer",
};

/** Mirrors ADUC's "Objekte auswählen" search/browse dialog (e.g. "Gruppen auswählen" from the "Mitglied von" tab). */
export function ObjectPickerDialog({
  title,
  type,
  multiple = true,
  onSelect,
  onClose,
}: {
  title: string;
  type: DirectoryObjectType;
  multiple?: boolean;
  onSelect: (objects: DirectoryObjectSummary[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, DirectoryObjectSummary>>(new Map());
  const summaryQuery = useQuery({ queryKey: ["setup-summary"], queryFn: () => api.get<SetupSummary>("/api/setup/summary") });
  const searchQuery = useQuery({
    queryKey: ["object-picker-search", type, query],
    queryFn: () => api.get<DirectoryObjectSummary[]>(`/api/directory/search?q=${encodeURIComponent(query)}&type=${type}`),
    enabled: false,
  });

  function toggle(obj: DirectoryObjectSummary) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(obj.dn)) {
        next.delete(obj.dn);
      } else {
        if (!multiple) next.clear();
        next.set(obj.dn, obj);
      }
      return next;
    });
  }

  function parentPath(dn: string): string {
    const parent = dn.slice(dn.indexOf(",") + 1);
    return dnToPath(parent);
  }

  return (
    <WindowsDialog
      title={title}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <WindowsButton variant="primary" disabled={selected.size === 0} onClick={() => onSelect([...selected.values()])}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Objekttyp:</WinLabel>
          <WinInput value={TYPE_OBJECT_LABEL[type]} disabled />
        </div>
        <div>
          <WinLabel>Suchpfad:</WinLabel>
          <WinInput value={summaryQuery.data?.realm ?? ""} disabled />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <WinLabel>Name:</WinLabel>
            <WinInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchQuery.refetch()}
              autoFocus
            />
          </div>
          <WindowsButton type="button" onClick={() => searchQuery.refetch()}>
            Jetzt suchen
          </WindowsButton>
        </div>

        <div>
          <p className="mb-1 text-sm text-slate-600 dark:text-slate-400">Suchergebnisse:</p>
          <div className="max-h-64 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="w-8 px-2 py-1" />
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Beschreibung</th>
                  <th className="px-2 py-1">Ordner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(searchQuery.data ?? []).map((obj) => (
                  <tr
                    key={obj.dn}
                    onClick={() => toggle(obj)}
                    className={`cursor-pointer ${
                      selected.has(obj.dn) ? "bg-indigo-50 dark:bg-indigo-950" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    <td className="px-2 py-1">
                      <input type="checkbox" readOnly checked={selected.has(obj.dn)} />
                    </td>
                    <td className="px-2 py-1 text-slate-800 dark:text-slate-100">{obj.name}</td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{obj.description ?? ""}</td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{parentPath(obj.dn)}</td>
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
