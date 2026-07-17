import { useQuery } from "@tanstack/react-query";
import type { GpoLink } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";

export function GpoLinksPanel({ ouDn }: { ouDn: string }) {
  const query = useQuery({
    queryKey: ["gpo-links", ouDn],
    queryFn: () => api.get<GpoLink[]>(`/api/directory/ous/${encodeDn(ouDn)}/gpo-links`),
  });

  const links = query.data ?? [];

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Verknüpfte Gruppenrichtlinien</h3>
      {query.isLoading && <p className="text-xs text-slate-400">Lade…</p>}
      <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-700">
        {links.map((link) => (
          <li key={link.gpoGuid} className="flex items-center justify-between px-2 py-1.5 text-xs">
            <span className="text-slate-700 dark:text-slate-300">{link.displayName}</span>
            <span className="flex gap-1">
              {link.enforced && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Erzwungen</span>}
              {link.disabled && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Deaktiviert</span>}
            </span>
          </li>
        ))}
        {links.length === 0 && !query.isLoading && <li className="px-2 py-2 text-xs text-slate-400">Keine GPO-Verknüpfungen</li>}
      </ul>
    </div>
  );
}
