import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { DirectoryObjectSummary, DirectoryObjectType } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput } from "./WindowsDialog";

export interface PickedObject {
  name: string;
  type: "user" | "group";
}

const WELL_KNOWN: PickedObject[] = [
  { name: "Everyone", type: "group" },
  { name: "Authenticated Users", type: "group" },
];

/** Mirrors Windows' "Select User or Group" object picker — search by name, pick from matching AD accounts, or one of the well-known security principals (Everyone, Authenticated Users) that have no AD object of their own. */
export function ObjectPickerDialog({ onSelect, onClose }: { onSelect: (picked: PickedObject) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const searchQuery = useQuery({
    queryKey: ["object-picker-search", query],
    queryFn: () => api.get<DirectoryObjectSummary[]>(`/api/directory/search?q=${encodeURIComponent(query)}`),
  });

  const results = (searchQuery.data ?? []).filter(
    (o): o is DirectoryObjectSummary & { type: "user" | "group" } => o.type === "user" || o.type === "group"
  );

  const wellKnownMatches = WELL_KNOWN.filter((w) => w.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <WindowsDialog title={t("objectPicker.title", "Select User or Group")} onClose={onClose} footer={<WindowsButton onClick={onClose}>{t("common.cancel", "Abbrechen")}</WindowsButton>}>
      <div className="space-y-3">
        <div>
          <WinInput
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("objectPicker.searchPlaceholder", "Type a name to search...")}
          />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-sm border border-slate-300 dark:border-slate-600">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1">{t("objectPicker.name", "Name")}</th>
                <th className="px-2 py-1">{t("objectPicker.type", "Type")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {wellKnownMatches.map((w) => (
                <tr
                  key={w.name}
                  className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  onClick={() => onSelect(w)}
                >
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{w.name}</td>
                  <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{t("objectPicker.wellKnown", "Well-known")}</td>
                </tr>
              ))}
              {results.map((o) => (
                <tr
                  key={o.dn}
                  className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  onClick={() => onSelect({ name: o.name, type: o.type as "user" | "group" })}
                >
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{o.name}</td>
                  <td className="px-2 py-1 text-slate-500 dark:text-slate-400">
                    {o.type === "user" ? t("objectPicker.user", "User") : t("objectPicker.group", "Group")}
                  </td>
                </tr>
              ))}
              {!searchQuery.isLoading && results.length === 0 && wellKnownMatches.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-2 py-4 text-center text-slate-400">
                    {t("objectPicker.noMatches", "No matches.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </WindowsDialog>
  );
}
