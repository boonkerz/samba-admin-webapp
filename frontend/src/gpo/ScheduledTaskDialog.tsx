import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { GpoObject, ScheduledTaskPreference, TaskTrigger, TaskAction, TaskPrincipal, TaskSettings } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox, WinTextarea } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { TaskTriggerDialog } from "./TaskTriggerDialog";
import { TaskActionDialog } from "./TaskActionDialog";

const ACTION_OPTIONS = [
  { value: "C", label: "Erstellen" },
  { value: "R", label: "Ersetzen" },
  { value: "U", label: "Aktualisieren" },
  { value: "D", label: "Löschen" },
];

const ACCOUNT_LABELS: Record<TaskPrincipal["account"], string> = {
  SYSTEM: "SYSTEM",
  "LOCAL SERVICE": "LOKALER DIENST",
  "NETWORK SERVICE": "NETZWERKDIENST",
  CURRENT_USER: "Aktueller Benutzer",
};

const TRIGGER_SUMMARY: Record<TaskTrigger["type"], (t: Extract<TaskTrigger, { type: TaskTrigger["type"] }>) => string> = {
  time: () => "Einmalig",
  daily: (t) => `Täglich, alle ${(t as Extract<TaskTrigger, { type: "daily" }>).daysInterval} Tag(e)`,
  weekly: (t) => `Wöchentlich, alle ${(t as Extract<TaskTrigger, { type: "weekly" }>).weeksInterval} Woche(n)`,
  monthly: () => "Monatlich",
  monthlyDow: () => "Monatlich (Wochentage)",
  logon: () => "Bei Anmeldung",
  boot: () => "Beim Start",
  idle: () => "Im Leerlauf",
  registration: () => "Bei Erstellung/Änderung der Aufgabe",
  sessionStateChange: (t) => `Sitzungsstatus: ${(t as Extract<TaskTrigger, { type: "sessionStateChange" }>).stateChange}`,
};

function actionSummary(a: TaskAction): string {
  if (a.type === "exec") return `Programm starten: ${a.command}`;
  if (a.type === "sendEmail") return `E-Mail senden an ${a.to ?? "?"}`;
  return `Nachricht anzeigen: ${a.title}`;
}

function useSaveTask(gpo: GpoObject, scope: "machine" | "user", uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid
        ? api.put(`/api/gpo/${gpo.guid}/scheduledtasks/${scope}/${uid}`, body)
        : api.post(`/api/gpo/${gpo.guid}/scheduledtasks/${scope}`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Geplante Aufgabe aktualisiert." : "Geplante Aufgabe erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real multi-tab "Eigenschaften für [Aufgabenname]" dialog (mind. Windows 7 task format). */
export function ScheduledTaskDialog({
  gpo,
  scope,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  item?: ScheduledTaskPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultsQuery = useQuery({
    queryKey: ["gpp-scheduledtasks-defaults"],
    queryFn: () => api.get<{ settings: TaskSettings; principal: TaskPrincipal }>(`/api/gpo/scheduledtasks-defaults`),
    enabled: !item,
  });

  const [tab, setTab] = useState("general");
  const [gpoAction, setGpoAction] = useState<ScheduledTaskPreference["action"]>(item?.action ?? "U");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [immediate, setImmediate] = useState(item?.immediate ?? false);
  const [principal, setPrincipal] = useState<TaskPrincipal>(
    item?.principal ?? { account: scope === "machine" ? "SYSTEM" : "CURRENT_USER", runLevel: "LeastPrivilege" }
  );
  const [triggers, setTriggers] = useState<TaskTrigger[]>(item?.triggers ?? []);
  const [actions, setActions] = useState<TaskAction[]>(item?.actions ?? []);
  const [settings, setSettings] = useState<TaskSettings>(
    item?.settings ??
      defaultsQuery.data?.settings ?? {
        enabled: true,
        hidden: false,
        allowStartOnDemand: true,
        startWhenAvailable: false,
        runOnlyIfNetworkAvailable: false,
        disallowStartIfOnBatteries: true,
        stopIfGoingOnBatteries: true,
        allowHardTerminate: true,
        wakeToRun: false,
        runOnlyIfIdle: false,
        executionTimeLimitMinutes: 4320,
        priority: 7,
        multipleInstancesPolicy: "IgnoreNew",
      }
  );

  const [editingTrigger, setEditingTrigger] = useState<{ trigger?: TaskTrigger } | null>(null);
  const [editingAction, setEditingAction] = useState<{ action?: TaskAction } | null>(null);

  const saveMutation = useSaveTask(gpo, scope, item?.uid, onSaved);

  const valid = name.trim().length > 0 && actions.length > 0 && (immediate || triggers.length > 0);

  return (
    <>
      <WindowsDialog
        title={item ? `Eigenschaften für ${item.name}` : "Neue Aufgabe"}
        onClose={onClose}
        maxWidthClassName="max-w-2xl"
        tabs={[
          { id: "general", label: "Allgemein" },
          { id: "triggers", label: "Trigger" },
          { id: "actions", label: "Aktionen" },
          { id: "settings", label: "Einstellungen" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
        footer={
          <>
            <WindowsButton
              variant="primary"
              disabled={!valid || saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate({
                  action: gpoAction,
                  scope,
                  name,
                  description: description || undefined,
                  immediate,
                  triggers,
                  actions,
                  principal,
                  settings,
                })
              }
            >
              OK
            </WindowsButton>
            <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
          </>
        }
      >
        {tab === "general" && (
          <div className="space-y-3">
            <div>
              <WinLabel>Aktion (Gruppenrichtlinie):</WinLabel>
              <WinSelect value={gpoAction} onChange={(e) => setGpoAction(e.target.value as ScheduledTaskPreference["action"])}>
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Name:</WinLabel>
              <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <WinLabel>Beschreibung:</WinLabel>
              <WinTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <WinCheckbox
              label="Sofortige Aufgabe (läuft einmalig beim nächsten Richtlinien-Update, keine Trigger)"
              checked={immediate}
              onChange={(e) => setImmediate(e.target.checked)}
            />
            <fieldset className="rounded-sm border border-slate-300 p-3 dark:border-slate-600">
              <legend className="px-1 text-xs text-slate-600 dark:text-slate-400">Sicherheitsoptionen</legend>
              <div className="space-y-2">
                <div>
                  <WinLabel>Ausführen als:</WinLabel>
                  <WinSelect
                    value={principal.account}
                    onChange={(e) => setPrincipal({ ...principal, account: e.target.value as TaskPrincipal["account"] })}
                  >
                    {(Object.keys(ACCOUNT_LABELS) as TaskPrincipal["account"][]).map((acc) => (
                      <option key={acc} value={acc}>
                        {ACCOUNT_LABELS[acc]}
                      </option>
                    ))}
                  </WinSelect>
                </div>
                <div>
                  <WinLabel>Ausführen mit höchsten Rechten:</WinLabel>
                  <WinSelect
                    value={principal.runLevel}
                    onChange={(e) => setPrincipal({ ...principal, runLevel: e.target.value as TaskPrincipal["runLevel"] })}
                  >
                    <option value="LeastPrivilege">Nein</option>
                    <option value="HighestAvailable">Ja</option>
                  </WinSelect>
                </div>
              </div>
            </fieldset>
          </div>
        )}

        {tab === "triggers" && (
          <div className="space-y-3">
            {immediate ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Sofortige Aufgaben haben keine Trigger — sie laufen einmalig beim nächsten Richtlinien-Update.
              </p>
            ) : (
              <>
                {triggers.length === 0 ? (
                  <p className="text-sm text-slate-400">Keine Trigger. Mindestens einer wird benötigt.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-300 dark:border-slate-600">
                        <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Details</th>
                        <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Aktiviert</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {triggers.map((t) => (
                        <tr key={t.uid} className="border-b border-slate-100 dark:border-slate-800">
                          <td
                            className="cursor-pointer px-2 py-1 text-slate-700 dark:text-slate-300"
                            onClick={() => setEditingTrigger({ trigger: t })}
                          >
                            {TRIGGER_SUMMARY[t.type](t as never)}
                          </td>
                          <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{t.enabled ? "Ja" : "Nein"}</td>
                          <td className="px-2 py-1 text-right">
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => setTriggers(triggers.filter((x) => x.uid !== t.uid))}
                            >
                              Entfernen
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <WindowsButton onClick={() => setEditingTrigger({})}>Neu...</WindowsButton>
              </>
            )}
          </div>
        )}

        {tab === "actions" && (
          <div className="space-y-3">
            {actions.length === 0 ? (
              <p className="text-sm text-slate-400">Keine Aktionen. Mindestens eine wird benötigt.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 dark:border-slate-600">
                    <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Details</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.uid} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="cursor-pointer px-2 py-1 text-slate-700 dark:text-slate-300" onClick={() => setEditingAction({ action: a })}>
                        {actionSummary(a)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => setActions(actions.filter((x) => x.uid !== a.uid))}
                        >
                          Entfernen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <WindowsButton onClick={() => setEditingAction({})}>Neu...</WindowsButton>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-2">
            <WinCheckbox label="Aktiviert" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
            <WinCheckbox label="Ausgeblendet" checked={settings.hidden} onChange={(e) => setSettings({ ...settings, hidden: e.target.checked })} />
            <WinCheckbox
              label="Ausführen auf Anforderung zulassen"
              checked={settings.allowStartOnDemand}
              onChange={(e) => setSettings({ ...settings, allowStartOnDemand: e.target.checked })}
            />
            <WinCheckbox
              label="Geplante Startzeit nachholen, sobald möglich"
              checked={settings.startWhenAvailable}
              onChange={(e) => setSettings({ ...settings, startWhenAvailable: e.target.checked })}
            />
            <WinCheckbox
              label="Nur starten, wenn Netzwerkverbindung verfügbar ist"
              checked={settings.runOnlyIfNetworkAvailable}
              onChange={(e) => setSettings({ ...settings, runOnlyIfNetworkAvailable: e.target.checked })}
            />
            <WinCheckbox
              label="Nur starten, wenn Computer im Leerlauf ist"
              checked={settings.runOnlyIfIdle}
              onChange={(e) => setSettings({ ...settings, runOnlyIfIdle: e.target.checked })}
            />
            <WinCheckbox
              label="Nicht starten, falls Computer im Akkubetrieb ist"
              checked={settings.disallowStartIfOnBatteries}
              onChange={(e) => setSettings({ ...settings, disallowStartIfOnBatteries: e.target.checked })}
            />
            <WinCheckbox
              label="Beenden, falls Computer in Akkubetrieb wechselt"
              checked={settings.stopIfGoingOnBatteries}
              onChange={(e) => setSettings({ ...settings, stopIfGoingOnBatteries: e.target.checked })}
            />
            <WinCheckbox
              label="Computer zum Ausführen der Aufgabe reaktivieren"
              checked={settings.wakeToRun}
              onChange={(e) => setSettings({ ...settings, wakeToRun: e.target.checked })}
            />
            <WinCheckbox
              label="Bei Bedarf Beenden des Vorgangs zulassen"
              checked={settings.allowHardTerminate}
              onChange={(e) => setSettings({ ...settings, allowHardTerminate: e.target.checked })}
            />
            <div>
              <WinLabel>Mehrfachinstanzen-Regel:</WinLabel>
              <WinSelect
                value={settings.multipleInstancesPolicy}
                onChange={(e) => setSettings({ ...settings, multipleInstancesPolicy: e.target.value as TaskSettings["multipleInstancesPolicy"] })}
              >
                <option value="Parallel">Neue Instanz parallel ausführen</option>
                <option value="Queue">Neue Instanz in Warteschlange stellen</option>
                <option value="IgnoreNew">Keine neue Instanz starten</option>
                <option value="StopExisting">Vorhandene Instanz beenden</option>
              </WinSelect>
            </div>
            <div>
              <WinLabel>Ausführungszeitlimit (Minuten, 0 = kein Limit):</WinLabel>
              <WinInput
                type="number"
                min={0}
                value={settings.executionTimeLimitMinutes ?? 0}
                onChange={(e) => setSettings({ ...settings, executionTimeLimitMinutes: Number(e.target.value) || undefined })}
              />
            </div>
            <div>
              <WinLabel>Priorität (0 = höchste, 10 = niedrigste):</WinLabel>
              <WinInput
                type="number"
                min={0}
                max={10}
                value={settings.priority}
                onChange={(e) => setSettings({ ...settings, priority: Number(e.target.value) })}
              />
            </div>
          </div>
        )}
      </WindowsDialog>

      {editingTrigger && (
        <TaskTriggerDialog
          trigger={editingTrigger.trigger}
          onClose={() => setEditingTrigger(null)}
          onSave={(t) => {
            setTriggers(editingTrigger.trigger ? triggers.map((x) => (x.uid === t.uid ? t : x)) : [...triggers, t]);
            setEditingTrigger(null);
          }}
        />
      )}

      {editingAction && (
        <TaskActionDialog
          action={editingAction.action}
          onClose={() => setEditingAction(null)}
          onSave={(a) => {
            setActions(editingAction.action ? actions.map((x) => (x.uid === a.uid ? a : x)) : [...actions, a]);
            setEditingAction(null);
          }}
        />
      )}
    </>
  );
}
