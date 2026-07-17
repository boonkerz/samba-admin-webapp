import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, GpoScopeLink, GpoSecurityPrincipal, WmiFilterRef, DirectoryObjectSummary } from "@samba-admin/shared";
import { api, encodeDn } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsButton, WinSelect } from "../components/WindowsDialog";
import { ObjectPickerDialog } from "../directory/ObjectPickerDialog";
import { WmiFiltersManagerDialog } from "./WmiFiltersManagerDialog";

/** Mirrors real GPMC's GPO Properties > Bereich tab: Verknüpfungen, Sicherheitsfilterung, WMI-Filterung. */
export function GpoScopeTab({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [showSecurityPicker, setShowSecurityPicker] = useState(false);
  const [showWmiFilters, setShowWmiFilters] = useState(false);

  const linksQuery = useQuery({
    queryKey: ["gpo-scope-links", gpo.guid],
    queryFn: () => api.get<GpoScopeLink[]>(`/api/directory/gpos/${gpo.guid}/links`),
  });
  const securityQuery = useQuery({
    queryKey: ["gpo-security-filtering", gpo.guid],
    queryFn: () => api.get<GpoSecurityPrincipal[]>(`/api/directory/gpos/${gpo.guid}/security-filtering`),
  });
  const wmiFiltersQuery = useQuery({
    queryKey: ["wmi-filters"],
    queryFn: () => api.get<WmiFilterRef[]>("/api/directory/wmi-filters"),
  });
  const detailsQuery = useQuery({
    queryKey: ["gpo-details", gpo.guid],
    queryFn: () => api.get<{ wmiFilter?: WmiFilterRef }>(`/api/directory/gpos/${gpo.guid}/details`),
  });

  const invalidateLinks = () => queryClient.invalidateQueries({ queryKey: ["gpo-scope-links", gpo.guid] });
  const invalidateSecurity = () => queryClient.invalidateQueries({ queryKey: ["gpo-security-filtering", gpo.guid] });

  const addLinkMutation = useMutation({
    mutationFn: (targetDn: string) => api.post(`/api/directory/gpos/${gpo.guid}/links`, { targetDn }),
    onSuccess: () => {
      pushToast("success", "Verknüpfung erstellt.");
      invalidateLinks();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({ targetDn, ...body }: { targetDn: string; enforced?: boolean; linkEnabled?: boolean }) =>
      api.put(`/api/directory/gpos/${gpo.guid}/links/${encodeDn(targetDn)}`, body),
    onSuccess: invalidateLinks,
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeLinkMutation = useMutation({
    mutationFn: (targetDn: string) => api.delete(`/api/directory/gpos/${gpo.guid}/links/${encodeDn(targetDn)}`),
    onSuccess: () => {
      pushToast("success", "Verknüpfung entfernt.");
      invalidateLinks();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const addSecurityMutation = useMutation({
    mutationFn: (sid: string) => api.post(`/api/directory/gpos/${gpo.guid}/security-filtering`, { sid }),
    onSuccess: () => {
      pushToast("success", "Sicherheitsfilterung aktualisiert.");
      invalidateSecurity();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const removeSecurityMutation = useMutation({
    mutationFn: (sid: string) => api.delete(`/api/directory/gpos/${gpo.guid}/security-filtering/${encodeURIComponent(sid)}`),
    onSuccess: () => {
      pushToast("success", "Aus Sicherheitsfilterung entfernt.");
      invalidateSecurity();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const wmiFilterMutation = useMutation({
    mutationFn: (filterDn: string | null) => api.put(`/api/directory/gpos/${gpo.guid}/wmi-filter`, { filterDn }),
    onSuccess: () => {
      pushToast("success", "WMI-Filter aktualisiert.");
      queryClient.invalidateQueries({ queryKey: ["gpo-details", gpo.guid] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function handlePickLinkTarget(objects: DirectoryObjectSummary[]) {
    setShowLinkPicker(false);
    for (const obj of objects) addLinkMutation.mutate(obj.dn);
  }

  function handlePickSecurityPrincipal(objects: DirectoryObjectSummary[]) {
    setShowSecurityPicker(false);
    for (const obj of objects) {
      if (!obj.objectSid) {
        pushToast("error", `Kein SID für "${obj.name}" gefunden.`);
        continue;
      }
      addSecurityMutation.mutate(obj.objectSid);
    }
  }

  const links = linksQuery.data ?? [];
  const securityPrincipals = securityQuery.data ?? [];
  const wmiFilters = wmiFiltersQuery.data ?? [];
  const currentWmiFilterDn = detailsQuery.data?.wmiFilter?.dn ?? "";

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">Verknüpfungen</h3>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Die folgenden Standorte, Domänen und Organisationseinheiten sind mit diesem Objekt verknüpft:
        </p>
        <div className="mb-2 flex gap-2">
          <WindowsButton onClick={() => setShowLinkPicker(true)}>Hinzufügen...</WindowsButton>
        </div>
        {linksQuery.isLoading ? (
          <p className="text-sm text-slate-400">Lade…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Verknüpfungen.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Pfad</th>
                <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Erzwungen</th>
                <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Verknüpfung aktiviert</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.targetDn} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{link.targetName}</td>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={link.enforced}
                      onChange={(e) => updateLinkMutation.mutate({ targetDn: link.targetDn, enforced: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={link.linkEnabled}
                      onChange={(e) => updateLinkMutation.mutate({ targetDn: link.targetDn, linkEnabled: e.target.checked })}
                    />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => {
                        if (confirm(`Verknüpfung mit "${link.targetName}" wirklich entfernen?`)) removeLinkMutation.mutate(link.targetDn);
                      }}
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">Sicherheitsfilterung</h3>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Die Einstellungen dieses Gruppenrichtlinienobjekts gelten nur für die folgenden Gruppen, Benutzer und Computer:
        </p>
        {securityQuery.isLoading ? (
          <p className="text-sm text-slate-400">Lade…</p>
        ) : (
          <table className="mb-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {securityPrincipals.map((p) => (
                <tr key={p.sid} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{p.name}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => {
                        if (confirm(`"${p.name}" wirklich entfernen?`)) removeSecurityMutation.mutate(p.sid);
                      }}
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex gap-2">
          <WindowsButton onClick={() => setShowSecurityPicker(true)}>Hinzufügen...</WindowsButton>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-200">WMI-Filterung</h3>
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Dieses Gruppenrichtlinienobjekt ist mit folgendem WMI-Filter verknüpft:</p>
        <div className="flex items-center gap-2">
          <WinSelect
            value={currentWmiFilterDn}
            onChange={(e) => wmiFilterMutation.mutate(e.target.value || null)}
            className="max-w-xs"
          >
            <option value="">&lt;Kein&gt;</option>
            {wmiFilters.map((f) => (
              <option key={f.dn} value={f.dn}>
                {f.name}
              </option>
            ))}
          </WinSelect>
          <WindowsButton type="button" onClick={() => setShowWmiFilters(true)}>
            Öffnen
          </WindowsButton>
        </div>
      </section>

      {showWmiFilters && <WmiFiltersManagerDialog onClose={() => setShowWmiFilters(false)} />}

      {showLinkPicker && (
        <ObjectPickerDialog title="Organisationseinheiten auswählen" type="ou" onSelect={handlePickLinkTarget} onClose={() => setShowLinkPicker(false)} />
      )}
      {showSecurityPicker && (
        <ObjectPickerDialog
          title="Gruppen auswählen"
          type="group"
          onSelect={handlePickSecurityPrincipal}
          onClose={() => setShowSecurityPicker(false)}
        />
      )}
    </div>
  );
}
