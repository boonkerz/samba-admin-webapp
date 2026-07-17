import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, RegionalOptionsPreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";

const DEFAULTS: Omit<RegionalOptionsPreference, "uid" | "order"> = {
  localeId: 1031,
  localeName: "Deutsch (Deutschland)",
  numDeciSymbol: ",",
  numNumDecimals: 2,
  numGrpSymbol: ".",
  numDigitGrpFmt: "3;0",
  numNegSymbol: "-",
  numNegFormat: 1,
  numLeadingZeros: true,
  numListSeparator: ";",
  numMeasurement: 0,
  currSymbol: "€",
  currPosFormat: 3,
  currNegFormat: 8,
  currDeciSymbol: ",",
  currNumDecimals: 2,
  currGrpSymbol: ".",
  currDigitGrpFmt: "3;0",
  timeFormat: "HH:mm:ss",
  timeSeparator: ":",
  timeAmSymbol: "",
  timePmSymbol: "",
  dateInterpretYearMax: 2029,
  dateShortFormat: "dd.MM.yyyy",
  dateSeparator: ".",
  dateLongFormat: "dddd, d. MMMM yyyy",
};

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Regionale Einstellungen properties page (a singleton, unlike other preference lists). */
export function RegionalOptionsPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ["gpp-regionaloptions", gpo.guid],
    queryFn: () => api.get<RegionalOptionsPreference | null>(`/api/gpo/${gpo.guid}/regionaloptions`),
  });

  const [form, setForm] = useState<Omit<RegionalOptionsPreference, "uid" | "order">>(DEFAULTS);

  useEffect(() => {
    if (query.data) {
      const { uid: _uid, order: _order, ...rest } = query.data;
      setForm(rest);
    }
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/api/gpo/${gpo.guid}/regionaloptions`, form),
    onSuccess: () => {
      pushToast("success", "Regionale Einstellungen gespeichert.");
      queryClient.invalidateQueries({ queryKey: ["gpp-regionaloptions", gpo.guid] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/gpo/${gpo.guid}/regionaloptions`),
    onSuccess: () => {
      pushToast("success", "Regionale Einstellungen entfernt.");
      setForm(DEFAULTS);
      queryClient.invalidateQueries({ queryKey: ["gpp-regionaloptions", gpo.guid] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function field(label: string, key: keyof typeof form, type: "text" | "number" = "text") {
    return (
      <div>
        <WinLabel>{label}:</WinLabel>
        <WinInput
          type={type}
          value={form[key] as string | number}
          onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) || 0 : e.target.value })}
        />
      </div>
    );
  }

  if (query.isLoading) {
    return <p className="p-4 text-sm text-slate-400">Lade…</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Regionale Einstellungen</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Gebietsschema für Benutzer.</p>
        </div>
        <div className="flex gap-2">
          {query.data && (
            <WindowsButton onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              Entfernen
            </WindowsButton>
          )}
          <WindowsButton variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Speichern
          </WindowsButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 py-4">
        {field("Gebietsschema-ID", "localeId", "number")}
        {field("Gebietsschema-Name", "localeName")}
        <div className="col-span-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Zahlen</div>
        {field("Dezimalsymbol", "numDeciSymbol")}
        {field("Nachkommastellen", "numNumDecimals", "number")}
        {field("Gruppierungssymbol", "numGrpSymbol")}
        {field("Ziffemgruppierung", "numDigitGrpFmt")}
        {field("Negatives Vorzeichen", "numNegSymbol")}
        {field("Negativformat", "numNegFormat", "number")}
        {field("Listentrennzeichen", "numListSeparator")}
        {field("Maßeinheit (0=metrisch, 1=US)", "numMeasurement", "number")}
        <div className="col-span-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Währung</div>
        {field("Währungssymbol", "currSymbol")}
        {field("Positivformat", "currPosFormat", "number")}
        {field("Negativformat", "currNegFormat", "number")}
        {field("Dezimalsymbol", "currDeciSymbol")}
        {field("Nachkommastellen", "currNumDecimals", "number")}
        {field("Gruppierungssymbol", "currGrpSymbol")}
        {field("Ziffemgruppierung", "currDigitGrpFmt")}
        <div className="col-span-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Uhrzeit</div>
        {field("Zeitformat", "timeFormat")}
        {field("Trennzeichen", "timeSeparator")}
        {field("AM-Symbol", "timeAmSymbol")}
        {field("PM-Symbol", "timePmSymbol")}
        <div className="col-span-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">Datum</div>
        {field("Kurzes Datumsformat", "dateShortFormat")}
        {field("Trennzeichen", "dateSeparator")}
        {field("Langes Datumsformat", "dateLongFormat")}
        {field("Jahr-Interpretationsgrenze", "dateInterpretYearMax", "number")}
      </div>
    </div>
  );
}
