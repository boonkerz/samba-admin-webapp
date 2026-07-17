import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectoryObjectSummary, RsopResult } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsButton } from "../components/WindowsDialog";
import { ObjectPickerDialog } from "../directory/ObjectPickerDialog";

/**
 * Real GPMC's Gruppenrichtlinienmodellierung wizard simulates which GPOs would apply purely from
 * AD data (no live client involved) — exactly what's implemented here. Its sibling,
 * "Gruppenrichtlinienergebnisse", instead queries a real reachable Windows client's live WMI/RSoP
 * data; this Linux-based backend has no path to do that, so it isn't implemented (see the
 * "gpo-results" tree node for that explanation).
 */
export function GpoModelingView() {
  const [target, setTarget] = useState<{ dn: string; name: string; type: "user" | "computer" } | null>(null);
  const [showPicker, setShowPicker] = useState<"user" | "computer" | null>(null);

  const query = useQuery({
    queryKey: ["gpo-modeling", target?.dn, target?.type],
    queryFn: () =>
      api.get<RsopResult>(`/api/directory/gpo-modeling?targetDn=${encodeURIComponent(target!.dn)}&targetType=${target!.type}`),
    enabled: !!target,
  });

  function handlePicked(objects: DirectoryObjectSummary[], type: "user" | "computer") {
    setShowPicker(null);
    const obj = objects[0];
    if (obj) setTarget({ dn: obj.dn, name: obj.name, type });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Gruppenrichtlinienmodellierung</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Simuliert, welche Gruppenrichtlinienobjekte für einen Benutzer oder Computer anhand der AD-Struktur gelten würden
          (Vererbung, Erzwungen, Vererbung deaktivieren, Sicherheitsfilterung). WMI-Filter werden angezeigt, aber nicht
          ausgewertet — dafür wäre eine Live-Abfrage des Zielcomputers nötig.
        </p>
      </div>

      <div className="flex gap-2">
        <WindowsButton type="button" onClick={() => setShowPicker("user")}>
          Benutzer auswählen...
        </WindowsButton>
        <WindowsButton type="button" onClick={() => setShowPicker("computer")}>
          Computer auswählen...
        </WindowsButton>
      </div>

      {target && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ziel: <span className="font-medium text-slate-800 dark:text-slate-200">{target.name}</span> ({target.type === "user" ? "Benutzer" : "Computer"})
        </p>
      )}

      {query.isLoading && <p className="text-sm text-slate-400">Wird berechnet…</p>}

      {query.data && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Reihenfolge</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Quelle</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Erzwungen</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Sicherheitsfilterung</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">WMI-Filter</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Wird angewendet</th>
            </tr>
          </thead>
          <tbody>
            {query.data.gpos.map((gpo, i) => (
              <tr key={gpo.guid} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{i + 1}</td>
                <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{gpo.displayName}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{gpo.sourceLabel}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{gpo.enforced ? "Ja" : "Nein"}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{gpo.securityFilterPass ? "Bestanden" : "Nicht bestanden"}</td>
                <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{gpo.wmiFilterName ?? "—"}</td>
                <td className={`px-2 py-1 font-medium ${gpo.willApply ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                  {gpo.willApply ? "Ja" : "Nein"}
                </td>
              </tr>
            ))}
            {query.data.gpos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-slate-400">
                  Keine verknüpften Gruppenrichtlinienobjekte gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showPicker && (
        <ObjectPickerDialog
          title={showPicker === "user" ? "Benutzer auswählen" : "Computer auswählen"}
          type={showPicker}
          multiple={false}
          onSelect={(objects) => handlePicked(objects, showPicker)}
          onClose={() => setShowPicker(null)}
        />
      )}
    </div>
  );
}
