import { useState } from "react";
import type { TaskTrigger, Weekday, MonthName } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const TRIGGER_TYPE_LABELS: Record<TaskTrigger["type"], string> = {
  time: "Einmalig",
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich (Tage)",
  monthlyDow: "Monatlich (Wochentage)",
  logon: "Bei Anmeldung",
  boot: "Beim Start",
  idle: "Im Leerlauf",
  registration: "Bei Erstellung/Änderung der Aufgabe",
  sessionStateChange: "Bei einer Sitzungsstatusänderung",
};

const WEEKDAY_LABELS: Record<Weekday, string> = {
  Monday: "Montag",
  Tuesday: "Dienstag",
  Wednesday: "Mittwoch",
  Thursday: "Donnerstag",
  Friday: "Freitag",
  Saturday: "Samstag",
  Sunday: "Sonntag",
};

const MONTH_LABELS: Record<MonthName, string> = {
  January: "Januar",
  February: "Februar",
  March: "März",
  April: "April",
  May: "Mai",
  June: "Juni",
  July: "Juli",
  August: "August",
  September: "September",
  October: "Oktober",
  November: "November",
  December: "Dezember",
};

const WEEKDAYS = Object.keys(WEEKDAY_LABELS) as Weekday[];
const MONTHS = Object.keys(MONTH_LABELS) as MonthName[];

function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

function toLocalInput(iso?: string): string {
  return iso ? iso.slice(0, 16) : nowLocal();
}

function fromLocalInput(v: string): string {
  return v.length === 16 ? `${v}:00` : v;
}

function makeDefaultTrigger(type: TaskTrigger["type"]): TaskTrigger {
  const uid = crypto.randomUUID();
  const base = { uid, enabled: true, startBoundary: `${nowLocal()}:00` };
  switch (type) {
    case "time":
      return { ...base, type };
    case "daily":
      return { ...base, type, daysInterval: 1 };
    case "weekly":
      return { ...base, type, weeksInterval: 1, daysOfWeek: ["Monday"] };
    case "monthly":
      return { ...base, type, daysOfMonth: ["1"], months: [...MONTHS] };
    case "monthlyDow":
      return { ...base, type, weeks: ["1"], daysOfWeek: ["Monday"], months: [...MONTHS] };
    case "logon":
      return { uid, enabled: true, type };
    case "boot":
      return { uid, enabled: true, type };
    case "idle":
      return { uid, enabled: true, type };
    case "registration":
      return { uid, enabled: true, type };
    case "sessionStateChange":
      return { uid, enabled: true, type, stateChange: "SessionUnlock" };
  }
}

/** Mirrors the real "Neuer Trigger" dialog for a scheduled task (mind. Windows 7). */
export function TaskTriggerDialog({
  trigger,
  onClose,
  onSave,
}: {
  trigger?: TaskTrigger;
  onClose: () => void;
  onSave: (t: TaskTrigger) => void;
}) {
  const [t, setT] = useState<TaskTrigger>(trigger ?? makeDefaultTrigger("daily"));

  function changeType(type: TaskTrigger["type"]) {
    setT((prev) => ({ ...makeDefaultTrigger(type), uid: prev.uid, startBoundary: prev.startBoundary, enabled: prev.enabled }));
  }

  function toggleWeekday(list: Weekday[], day: Weekday): Weekday[] {
    return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
  }

  function toggleMonth(list: MonthName[], month: MonthName): MonthName[] {
    return list.includes(month) ? list.filter((m) => m !== month) : [...list, month];
  }

  const needsStartBoundary = t.type !== "logon" && t.type !== "boot" && t.type !== "idle" && t.type !== "registration" && t.type !== "sessionStateChange";

  return (
    <WindowsDialog
      title="Neuer Trigger"
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton variant="primary" onClick={() => onSave(t)}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aufgabe beginnen:</WinLabel>
          <WinSelect value={t.type} onChange={(e) => changeType(e.target.value as TaskTrigger["type"])}>
            {(Object.keys(TRIGGER_TYPE_LABELS) as TaskTrigger["type"][]).map((type) => (
              <option key={type} value={type}>
                {TRIGGER_TYPE_LABELS[type]}
              </option>
            ))}
          </WinSelect>
        </div>

        {needsStartBoundary && (
          <div>
            <WinLabel>Start:</WinLabel>
            <WinInput
              type="datetime-local"
              value={toLocalInput(t.startBoundary)}
              onChange={(e) => setT({ ...t, startBoundary: fromLocalInput(e.target.value) })}
            />
          </div>
        )}

        {t.type === "daily" && (
          <div>
            <WinLabel>Wiederholen alle (Tage):</WinLabel>
            <WinInput
              type="number"
              min={1}
              max={365}
              value={t.daysInterval}
              onChange={(e) => setT({ ...t, daysInterval: Number(e.target.value) || 1 })}
            />
          </div>
        )}

        {t.type === "weekly" && (
          <>
            <div>
              <WinLabel>Wiederholen alle (Wochen):</WinLabel>
              <WinInput
                type="number"
                min={1}
                max={52}
                value={t.weeksInterval}
                onChange={(e) => setT({ ...t, weeksInterval: Number(e.target.value) || 1 })}
              />
            </div>
            <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
              <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Wochentage</legend>
              <div className="grid grid-cols-2 gap-1">
                {WEEKDAYS.map((d) => (
                  <WinCheckbox
                    key={d}
                    label={WEEKDAY_LABELS[d]}
                    checked={t.daysOfWeek.includes(d)}
                    onChange={() => setT({ ...t, daysOfWeek: toggleWeekday(t.daysOfWeek, d) })}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {t.type === "monthly" && (
          <>
            <div>
              <WinLabel>Tage im Monat (kommagetrennt, z.B. 1,15 oder Last):</WinLabel>
              <WinInput
                value={t.daysOfMonth.join(",")}
                onChange={(e) => setT({ ...t, daysOfMonth: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
            <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
              <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Monate</legend>
              <div className="grid grid-cols-3 gap-1">
                {MONTHS.map((m) => (
                  <WinCheckbox
                    key={m}
                    label={MONTH_LABELS[m]}
                    checked={t.months.includes(m)}
                    onChange={() => setT({ ...t, months: toggleMonth(t.months, m) })}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {t.type === "monthlyDow" && (
          <>
            <div>
              <WinLabel>Wochen im Monat (kommagetrennt, 1-4 oder Last):</WinLabel>
              <WinInput
                value={t.weeks.join(",")}
                onChange={(e) => setT({ ...t, weeks: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
            </div>
            <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
              <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Wochentage</legend>
              <div className="grid grid-cols-2 gap-1">
                {WEEKDAYS.map((d) => (
                  <WinCheckbox
                    key={d}
                    label={WEEKDAY_LABELS[d]}
                    checked={t.daysOfWeek.includes(d)}
                    onChange={() => setT({ ...t, daysOfWeek: toggleWeekday(t.daysOfWeek, d) })}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
              <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Monate</legend>
              <div className="grid grid-cols-3 gap-1">
                {MONTHS.map((m) => (
                  <WinCheckbox
                    key={m}
                    label={MONTH_LABELS[m]}
                    checked={t.months.includes(m)}
                    onChange={() => setT({ ...t, months: toggleMonth(t.months, m) })}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {t.type === "logon" && (
          <div>
            <WinLabel>Bestimmter Benutzer (leer = beliebiger Benutzer):</WinLabel>
            <WinInput value={t.userId ?? ""} onChange={(e) => setT({ ...t, userId: e.target.value || undefined })} />
          </div>
        )}

        {t.type === "sessionStateChange" && (
          <>
            <div>
              <WinLabel>Ereignis:</WinLabel>
              <WinSelect
                value={t.stateChange}
                onChange={(e) => setT({ ...t, stateChange: e.target.value as typeof t.stateChange })}
              >
                <option value="ConsoleConnect">Verbindung mit lokaler Sitzung</option>
                <option value="ConsoleDisconnect">Trennung von lokaler Sitzung</option>
                <option value="RemoteConnect">Verbindung über Remotedesktop</option>
                <option value="RemoteDisconnect">Trennung von Remotedesktop</option>
                <option value="SessionLock">Sperren des Arbeitsplatzes</option>
                <option value="SessionUnlock">Entsperren des Arbeitsplatzes</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Bestimmter Benutzer (leer = beliebiger Benutzer):</WinLabel>
              <WinInput value={t.userId ?? ""} onChange={(e) => setT({ ...t, userId: e.target.value || undefined })} />
            </div>
          </>
        )}

        {(t.type === "boot" || t.type === "registration" || t.type === "logon") && (
          <div>
            <WinLabel>Verzögerung (Minuten):</WinLabel>
            <WinInput
              type="number"
              min={0}
              value={t.delayMinutes ?? 0}
              onChange={(e) => setT({ ...t, delayMinutes: Number(e.target.value) || undefined })}
            />
          </div>
        )}

        <WinCheckbox label="Aktiviert" checked={t.enabled} onChange={(e) => setT({ ...t, enabled: e.target.checked })} />
      </div>
    </WindowsDialog>
  );
}
