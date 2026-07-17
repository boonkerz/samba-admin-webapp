import { useQuery } from "@tanstack/react-query";
import type { GpoObject, GpoSettingsSummary } from "@samba-admin/shared";
import { api } from "../api/client";

function SettingsGroup({ title, summary }: { title: string; summary: GpoSettingsSummary["machine"] }) {
  const configuredCounts = summary.preferenceCounts.filter((c) => c.count > 0);

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">{title}</h3>
      {summary.admxPolicies.length === 0 && configuredCounts.length === 0 ? (
        <p className="text-sm text-slate-400">Keine Einstellungen konfiguriert.</p>
      ) : (
        <div className="space-y-3">
          {summary.admxPolicies.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Administrative Vorlagen ({summary.admxPolicies.length})
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-600">
                    <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Richtlinie</th>
                    <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Schlüssel</th>
                    <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Wert</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.admxPolicies.map((p, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{p.policyName}</td>
                      <td className="break-all px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400">{p.categoryPath}</td>
                      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{p.values?.value ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {configuredCounts.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Einstellungen</p>
              <ul className="space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
                {configuredCounts.map((c) => (
                  <li key={c.name}>
                    {c.name}: {c.count} konfiguriert
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Mirrors real GPMC's GPO Properties > Einstellungen tab — a read-only report, not an editor. */
export function GpoSettingsTab({ gpo }: { gpo: GpoObject }) {
  const query = useQuery({
    queryKey: ["gpo-settings-summary", gpo.guid],
    queryFn: () => api.get<GpoSettingsSummary>(`/api/directory/gpos/${gpo.guid}/settings-summary`),
  });

  if (query.isLoading) return <p className="text-sm text-slate-400">Lade…</p>;
  if (!query.data) return <p className="text-sm text-slate-400">Keine Daten verfügbar.</p>;

  return (
    <div className="space-y-6">
      <SettingsGroup title="Computerkonfiguration" summary={query.data.machine} />
      <SettingsGroup title="Benutzerkonfiguration" summary={query.data.user} />
    </div>
  );
}
