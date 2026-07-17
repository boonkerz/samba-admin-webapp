import { useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GpoObject, ServicePreference } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ContextMenu, type ContextMenuEntry } from "../components/ContextMenu";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox } from "../components/WindowsDialog";

const FAILURE_OPTIONS: { value: ServicePreference["firstFailure"]; label: string }[] = [
  { value: "NOACTION", label: "Keine Aktion" },
  { value: "START", label: "Starten" },
  { value: "STOP", label: "Beenden" },
  { value: "RESTART", label: "Neu starten" },
  { value: "RESTART_IF_REQUIRED", label: "Bei Bedarf neu starten" },
];

function ServiceDialog({ gpo, item, onClose, onSaved }: { gpo: GpoObject; item?: ServicePreference; onClose: () => void; onSaved: () => void }) {
  const pushToast = useToastStore((s) => s.push);
  const [serviceName, setServiceName] = useState(item?.serviceName ?? "");
  const [serviceAction, setServiceAction] = useState<ServicePreference["serviceAction"]>(item?.serviceAction ?? "NOCHANGE");
  const [startupType, setStartupType] = useState<ServicePreference["startupType"]>(item?.startupType ?? "NOCHANGE");
  const [timeout, setTimeoutVal] = useState(item?.timeout ?? 30);
  const [accountName, setAccountName] = useState(item?.accountName ?? "");
  const [interact, setInteract] = useState(item?.interact ?? false);
  const [firstFailure, setFirstFailure] = useState<ServicePreference["firstFailure"]>(item?.firstFailure ?? "NOACTION");
  const [secondFailure, setSecondFailure] = useState<ServicePreference["secondFailure"]>(item?.secondFailure ?? "NOACTION");
  const [thirdFailure, setThirdFailure] = useState<ServicePreference["thirdFailure"]>(item?.thirdFailure ?? "NOACTION");
  const [restartServiceDelay, setRestartServiceDelay] = useState(item?.restartServiceDelay ?? 0);
  const [restartComputerDelay, setRestartComputerDelay] = useState(item?.restartComputerDelay ?? 0);
  const [restartMessage, setRestartMessage] = useState(item?.restartMessage ?? "");
  const [program, setProgram] = useState(item?.program ?? "");
  const [args, setArgs] = useState(item?.args ?? "");

  const saveMutation = useMutation({
    mutationFn: (body: unknown) => (item ? api.put(`/api/gpo/${gpo.guid}/services/${item.uid}`, body) : api.post(`/api/gpo/${gpo.guid}/services`, body)),
    onSuccess: () => {
      pushToast("success", item ? "Dienst aktualisiert." : "Dienst erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = serviceName.trim().length > 0;

  return (
    <WindowsDialog
      title={item ? "Eigenschaften für Dienst" : "Neue Eigenschaften für Dienst"}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                serviceName,
                serviceAction,
                startupType,
                timeout,
                accountName: accountName || undefined,
                interact,
                firstFailure,
                secondFailure,
                thirdFailure,
                restartServiceDelay: restartServiceDelay || undefined,
                restartComputerDelay: restartComputerDelay || undefined,
                restartMessage: restartMessage || undefined,
                program: program || undefined,
                args: args || undefined,
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
          <WinLabel>Dienstname:</WinLabel>
          <WinInput value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Computer Browser" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Dienststatus:</WinLabel>
            <WinSelect value={serviceAction} onChange={(e) => setServiceAction(e.target.value as ServicePreference["serviceAction"])}>
              <option value="NOCHANGE">Nicht ändern</option>
              <option value="START">Starten</option>
              <option value="STOP">Beenden</option>
              <option value="RESTART">Neu starten</option>
              <option value="RESTART_IF_REQUIRED">Bei Bedarf neu starten</option>
            </WinSelect>
          </div>
          <div>
            <WinLabel>Starttyp:</WinLabel>
            <WinSelect value={startupType} onChange={(e) => setStartupType(e.target.value as ServicePreference["startupType"])}>
              <option value="NOCHANGE">Nicht ändern</option>
              <option value="AUTOMATIC">Automatisch</option>
              <option value="BOOT">Boot</option>
              <option value="DISABLED">Deaktiviert</option>
              <option value="MANUAL">Manuell</option>
              <option value="SYSTEM">System</option>
            </WinSelect>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Anmeldekonto (optional):</WinLabel>
            <WinInput value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="LocalSystem" />
          </div>
          <div>
            <WinLabel>Zeitlimit (Sek.):</WinLabel>
            <WinInput type="number" min={0} value={timeout} onChange={(e) => setTimeoutVal(Number(e.target.value) || 0)} />
          </div>
        </div>
        <WinCheckbox label="Mit Desktop interagieren zulassen" checked={interact} onChange={(e) => setInteract(e.target.checked)} />
        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <WinLabel>Wiederherstellung bei Fehlern:</WinLabel>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <WinLabel>Erster Fehler:</WinLabel>
              <WinSelect value={firstFailure} onChange={(e) => setFirstFailure(e.target.value as ServicePreference["firstFailure"])}>
                {FAILURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Zweiter Fehler:</WinLabel>
              <WinSelect value={secondFailure} onChange={(e) => setSecondFailure(e.target.value as ServicePreference["secondFailure"])}>
                {FAILURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </WinSelect>
            </div>
            <div>
              <WinLabel>Weitere Fehler:</WinLabel>
              <WinSelect value={thirdFailure} onChange={(e) => setThirdFailure(e.target.value as ServicePreference["thirdFailure"])}>
                {FAILURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </WinSelect>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Verzögerung Dienst-Neustart (ms):</WinLabel>
            <WinInput type="number" min={0} value={restartServiceDelay} onChange={(e) => setRestartServiceDelay(Number(e.target.value) || 0)} />
          </div>
          <div>
            <WinLabel>Verzögerung Computer-Neustart (ms):</WinLabel>
            <WinInput type="number" min={0} value={restartComputerDelay} onChange={(e) => setRestartComputerDelay(Number(e.target.value) || 0)} />
          </div>
        </div>
        <div>
          <WinLabel>Neustart-Meldung (optional):</WinLabel>
          <WinInput value={restartMessage} onChange={(e) => setRestartMessage(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Programm bei Fehler (optional):</WinLabel>
            <WinInput value={program} onChange={(e) => setProgram(e.target.value)} />
          </div>
          <div>
            <WinLabel>Argumente (optional):</WinLabel>
            <WinInput value={args} onChange={(e) => setArgs(e.target.value)} />
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}

/** Mirrors real GPME's Einstellungen > Systemsteuerungseinstellungen > Dienste list view. */
export function ServicesPanel({ gpo }: { gpo: GpoObject }) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [menu, setMenu] = useState<{ x: number; y: number; item?: ServicePreference }>();
  const [editing, setEditing] = useState<{ item?: ServicePreference } | null>(null);

  const query = useQuery({
    queryKey: ["gpp-services", gpo.guid],
    queryFn: () => api.get<ServicePreference[]>(`/api/gpo/${gpo.guid}/services`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["gpp-services", gpo.guid] });

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => api.delete(`/api/gpo/${gpo.guid}/services/${uid}`),
    onSuccess: () => {
      pushToast("success", "Dienst gelöscht.");
      invalidate();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const items = query.data ?? [];

  function handleContextMenu(e: MouseEvent, item?: ServicePreference) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, item });
  }

  const entries: ContextMenuEntry[] | undefined = menu && [
    { label: "Neu", children: [{ label: "Dienst...", onClick: () => setEditing({}) }] },
    ...(menu.item
      ? ([
          { separator: true },
          { label: "Eigenschaften...", onClick: () => setEditing({ item: menu.item }) },
          {
            label: "Löschen",
            danger: true,
            onClick: () => {
              if (confirm(`Dienst "${menu.item!.serviceName}" wirklich löschen?`)) deleteMutation.mutate(menu.item!.uid);
            },
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => handleContextMenu(e)}>
      <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">Dienste</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Dienstkonfiguration für den Computer.</p>
      </div>
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">Lade…</p>
        ) : items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Rechtsklick → Neu, um einen Dienst hinzuzufügen.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Dienstname</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Starttyp</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Dienststatus</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.uid}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                  onDoubleClick={() => setEditing({ item })}
                  onContextMenu={(e) => handleContextMenu(e, item)}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.serviceName}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.startupType}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{item.serviceAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {menu && entries && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(undefined)} />}
      {editing && (
        <ServiceDialog
          gpo={gpo}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
