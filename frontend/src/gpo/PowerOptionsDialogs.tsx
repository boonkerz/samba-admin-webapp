import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  GpoObject,
  GlobalPowerOptionsXpPreference,
  PowerSchemeXpPreference,
  PowerPlanV2Preference,
} from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";

const ACTION_OPTIONS = [
  { value: "C", label: "Erstellen" },
  { value: "R", label: "Ersetzen" },
  { value: "U", label: "Aktualisieren" },
  { value: "D", label: "Löschen" },
];

const XP_ACTION_OPTIONS: { value: GlobalPowerOptionsXpPreference["closeLid"]; label: string }[] = [
  { value: "NONE", label: "Nichts unternehmen" },
  { value: "STAND_BY", label: "Standbymodus" },
  { value: "HIBERNATE", label: "Ruhezustand" },
  { value: "SHUT_DOWN", label: "Herunterfahren" },
];

const V2_ACTION_OPTIONS: { value: PowerPlanV2Preference["lidCloseAc"]; label: string }[] = [
  { value: "DO_NOTHING", label: "Nichts unternehmen" },
  { value: "SLEEP", label: "Energie sparen" },
  { value: "HIBERNATE", label: "Ruhezustand" },
  { value: "SHUT_DOWN", label: "Herunterfahren" },
];

function useSavePowerOptions(gpo: GpoObject, uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid ? api.put(`/api/gpo/${gpo.guid}/poweroptions/${uid}`, body) : api.post(`/api/gpo/${gpo.guid}/poweroptions`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Energieoption aktualisiert." : "Energieoption erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** Mirrors the real "Eigenschaften für Energieschema (Windows XP)" dialog. */
export function GlobalPowerOptionsXpDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: GlobalPowerOptionsXpPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [showIcon, setShowIcon] = useState(item?.showIcon ?? true);
  const [promptPassword, setPromptPassword] = useState(item?.promptPassword ?? true);
  const [enableHibernation, setEnableHibernation] = useState(item?.enableHibernation ?? true);
  const [closeLid, setCloseLid] = useState(item?.closeLid ?? "NONE");
  const [pressPowerBtn, setPressPowerBtn] = useState(item?.pressPowerBtn ?? "NONE");
  const [pressSleepBtn, setPressSleepBtn] = useState(item?.pressSleepBtn ?? "NONE");
  const saveMutation = useSavePowerOptions(gpo, item?.uid, onSaved);

  return (
    <WindowsDialog
      title="Eigenschaften für Energieschema (Windows XP)"
      onClose={onClose}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                kind: "globalXp",
                action: "U",
                showIcon,
                promptPassword,
                enableHibernation,
                closeLid,
                pressPowerBtn,
                pressSleepBtn,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <WinCheckbox label="Symbol in der Taskleiste anzeigen" checked={showIcon} onChange={(e) => setShowIcon(e.target.checked)} />
        <WinCheckbox
          label="Kennwort beim Reaktivieren anfordern"
          checked={promptPassword}
          onChange={(e) => setPromptPassword(e.target.checked)}
        />
        <WinCheckbox
          label="Ruhezustand aktivieren"
          checked={enableHibernation}
          onChange={(e) => setEnableHibernation(e.target.checked)}
        />
        <div>
          <WinLabel>Beim Schließen des Deckels:</WinLabel>
          <WinSelect value={closeLid} onChange={(e) => setCloseLid(e.target.value as typeof closeLid)}>
            {XP_ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Beim Drücken des Netzschalters:</WinLabel>
          <WinSelect value={pressPowerBtn} onChange={(e) => setPressPowerBtn(e.target.value as typeof pressPowerBtn)}>
            {XP_ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
        <div>
          <WinLabel>Beim Drücken des Energiesparschalters:</WinLabel>
          <WinSelect value={pressSleepBtn} onChange={(e) => setPressSleepBtn(e.target.value as typeof pressSleepBtn)}>
            {XP_ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </WinSelect>
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Eigenschaften für Energieschema" (Windows XP named scheme) dialog. */
export function PowerSchemeXpDialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: PowerSchemeXpPreference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<PowerSchemeXpPreference["action"]>(item?.action ?? "U");
  const [name, setName] = useState(item?.name ?? "");
  const [isDefault, setIsDefault] = useState(item?.default ?? false);
  const [monitorAc, setMonitorAc] = useState(item?.monitorAc ?? 20);
  const [monitorDc, setMonitorDc] = useState(item?.monitorDc ?? 5);
  const [hardDiskAc, setHardDiskAc] = useState(item?.hardDiskAc ?? 0);
  const [hardDiskDc, setHardDiskDc] = useState(item?.hardDiskDc ?? 10);
  const [standbyAc, setStandbyAc] = useState(item?.standbyAc ?? 0);
  const [standbyDc, setStandbyDc] = useState(item?.standbyDc ?? 5);
  const [hibernateAc, setHibernateAc] = useState(item?.hibernateAc ?? 0);
  const [hibernateDc, setHibernateDc] = useState(item?.hibernateDc ?? 20);
  const saveMutation = useSavePowerOptions(gpo, item?.uid, onSaved);

  const valid = name.trim().length > 0;

  const row = (label: string, ac: number, setAc: (n: number) => void, dc: number, setDc: (n: number) => void) => (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <WinInput type="number" min={0} value={ac} onChange={(e) => setAc(Number(e.target.value) || 0)} />
      <WinInput type="number" min={0} value={dc} onChange={(e) => setDc(Number(e.target.value) || 0)} />
    </div>
  );

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Energieschema" : "Neues Energieschema (Windows XP)"}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                kind: "schemeXp",
                action,
                name,
                default: isDefault,
                monitorAc,
                monitorDc,
                hardDiskAc,
                hardDiskDc,
                standbyAc,
                standbyDc,
                hibernateAc,
                hibernateDc,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as PowerSchemeXpPreference["action"])}>
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
        <WinCheckbox label="Als Standardschema festlegen" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Zeit bis (Minuten)</span>
          <span>Netzbetrieb</span>
          <span>Akkubetrieb</span>
        </div>
        {row("Monitor ausschalten", monitorAc, setMonitorAc, monitorDc, setMonitorDc)}
        {row("Festplatten ausschalten", hardDiskAc, setHardDiskAc, hardDiskDc, setHardDiskDc)}
        {row("Standbymodus", standbyAc, setStandbyAc, standbyDc, setStandbyDc)}
        {row("Ruhezustand", hibernateAc, setHibernateAc, hibernateDc, setHibernateDc)}
      </div>
    </WindowsDialog>
  );
}

/** Mirrors the real "Eigenschaften für Energieplan" (mind. Windows Vista) dialog. */
export function PowerPlanV2Dialog({
  gpo,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  item?: PowerPlanV2Preference;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState<PowerPlanV2Preference["action"]>(item?.action ?? "U");
  const [name, setName] = useState(item?.name ?? "");
  const [isDefault, setIsDefault] = useState(item?.default ?? false);
  const [p, setP] = useState({
    requireWakePwdAc: item?.requireWakePwdAc ?? true,
    requireWakePwdDc: item?.requireWakePwdDc ?? true,
    turnOffHdAc: item?.turnOffHdAc ?? 20,
    turnOffHdDc: item?.turnOffHdDc ?? 10,
    sleepAfterAc: item?.sleepAfterAc ?? 30,
    sleepAfterDc: item?.sleepAfterDc ?? 15,
    allowHybridSleepAc: item?.allowHybridSleepAc ?? true,
    allowHybridSleepDc: item?.allowHybridSleepDc ?? false,
    hibernateAc: item?.hibernateAc ?? 180,
    hibernateDc: item?.hibernateDc ?? 60,
    lidCloseAc: item?.lidCloseAc ?? "SLEEP",
    lidCloseDc: item?.lidCloseDc ?? "SLEEP",
    pbActionAc: item?.pbActionAc ?? "SHUT_DOWN",
    pbActionDc: item?.pbActionDc ?? "SHUT_DOWN",
    strtMenuActionAc: item?.strtMenuActionAc ?? "DO_NOTHING",
    strtMenuActionDc: item?.strtMenuActionDc ?? "DO_NOTHING",
    linkPwrMgmtAc: item?.linkPwrMgmtAc ?? true,
    linkPwrMgmtDc: item?.linkPwrMgmtDc ?? true,
    procStateMinAc: item?.procStateMinAc ?? 5,
    procStateMinDc: item?.procStateMinDc ?? 5,
    procStateMaxAc: item?.procStateMaxAc ?? 100,
    procStateMaxDc: item?.procStateMaxDc ?? 100,
    displayOffAc: item?.displayOffAc ?? 10,
    displayOffDc: item?.displayOffDc ?? 5,
    adaptiveAc: item?.adaptiveAc ?? true,
    adaptiveDc: item?.adaptiveDc ?? true,
    critBatActionAc: item?.critBatActionAc ?? "DO_NOTHING",
    critBatActionDc: item?.critBatActionDc ?? "HIBERNATE",
    lowBatteryLvlAc: item?.lowBatteryLvlAc ?? 10,
    lowBatteryLvlDc: item?.lowBatteryLvlDc ?? 10,
    critBatteryLvlAc: item?.critBatteryLvlAc ?? 5,
    critBatteryLvlDc: item?.critBatteryLvlDc ?? 5,
    lowBatteryNotAc: item?.lowBatteryNotAc ?? false,
    lowBatteryNotDc: item?.lowBatteryNotDc ?? true,
    lowBatteryActionAc: item?.lowBatteryActionAc ?? "DO_NOTHING",
    lowBatteryActionDc: item?.lowBatteryActionDc ?? "DO_NOTHING",
  });
  const saveMutation = useSavePowerOptions(gpo, item?.uid, onSaved);

  const valid = name.trim().length > 0;
  type P = typeof p;

  const minutesRow = <K extends keyof P>(label: string, acKey: K, dcKey: K) => (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label} (Min., 0=nie)</span>
      <WinInput type="number" min={0} value={p[acKey] as number} onChange={(e) => setP({ ...p, [acKey]: Number(e.target.value) || 0 })} />
      <WinInput type="number" min={0} value={p[dcKey] as number} onChange={(e) => setP({ ...p, [dcKey]: Number(e.target.value) || 0 })} />
    </div>
  );

  const percentRow = <K extends keyof P>(label: string, acKey: K, dcKey: K) => (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label} (%)</span>
      <WinInput
        type="number"
        min={0}
        max={100}
        value={p[acKey] as number}
        onChange={(e) => setP({ ...p, [acKey]: Number(e.target.value) || 0 })}
      />
      <WinInput
        type="number"
        min={0}
        max={100}
        value={p[dcKey] as number}
        onChange={(e) => setP({ ...p, [dcKey]: Number(e.target.value) || 0 })}
      />
    </div>
  );

  const boolRow = <K extends keyof P>(label: string, acKey: K, dcKey: K) => (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <input
        type="checkbox"
        checked={p[acKey] as boolean}
        onChange={(e) => setP({ ...p, [acKey]: e.target.checked })}
        className="h-4 w-4"
      />
      <input
        type="checkbox"
        checked={p[dcKey] as boolean}
        onChange={(e) => setP({ ...p, [dcKey]: e.target.checked })}
        className="h-4 w-4"
      />
    </div>
  );

  const actionRow = <K extends keyof P>(label: string, acKey: K, dcKey: K) => (
    <div className="grid grid-cols-3 items-center gap-2">
      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <WinSelect value={p[acKey] as string} onChange={(e) => setP({ ...p, [acKey]: e.target.value })}>
        {V2_ACTION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </WinSelect>
      <WinSelect value={p[dcKey] as string} onChange={(e) => setP({ ...p, [dcKey]: e.target.value })}>
        {V2_ACTION_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </WinSelect>
    </div>
  );

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Energieplan" : "Neuer Energieplan (mindestens Windows Vista)"}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                kind: "planV2",
                action,
                name,
                nameGuid: item?.nameGuid ?? `{${crypto.randomUUID().toUpperCase()}}`,
                default: isDefault,
                ...p,
              })
            }
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={action} onChange={(e) => setAction(e.target.value as PowerPlanV2Preference["action"])}>
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
        <WinCheckbox label="Als Standardplan festlegen" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />

        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span />
          <span>Netzbetrieb</span>
          <span>Akkubetrieb</span>
        </div>

        {minutesRow("Bildschirm ausschalten", "displayOffAc", "displayOffDc")}
        {minutesRow("Computer in Energiesparmodus", "sleepAfterAc", "sleepAfterDc")}
        {minutesRow("Festplatte ausschalten", "turnOffHdAc", "turnOffHdDc")}
        {minutesRow("Ruhezustand nach", "hibernateAc", "hibernateDc")}
        {boolRow("Hybriden Standbymodus zulassen", "allowHybridSleepAc", "allowHybridSleepDc")}
        {boolRow("Kennwort beim Reaktivieren anfordern", "requireWakePwdAc", "requireWakePwdDc")}
        {actionRow("Beim Schließen des Deckels", "lidCloseAc", "lidCloseDc")}
        {actionRow("Beim Drücken des Netzschalters", "pbActionAc", "pbActionDc")}
        {actionRow("Beim Drücken der Energiespartaste", "strtMenuActionAc", "strtMenuActionDc")}
        {boolRow("Verbindungsstromsparfunktionen", "linkPwrMgmtAc", "linkPwrMgmtDc")}
        {percentRow("Minimaler Prozessorzustand", "procStateMinAc", "procStateMinDc")}
        {percentRow("Maximaler Prozessorzustand", "procStateMaxAc", "procStateMaxDc")}
        {boolRow("Adaptive Anzeige", "adaptiveAc", "adaptiveDc")}
        {actionRow("Bei kritischem Akkustand", "critBatActionAc", "critBatActionDc")}
        {percentRow("Niedriger Akkustand-Schwellenwert", "lowBatteryLvlAc", "lowBatteryLvlDc")}
        {percentRow("Kritischer Akkustand-Schwellenwert", "critBatteryLvlAc", "critBatteryLvlDc")}
        {boolRow("Benachrichtigung bei niedrigem Akkustand", "lowBatteryNotAc", "lowBatteryNotDc")}
        {actionRow("Aktion bei niedrigem Akkustand", "lowBatteryActionAc", "lowBatteryActionDc")}
      </div>
    </WindowsDialog>
  );
}
