import { useState } from "react";
import type { TaskAction } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinTextarea } from "../components/WindowsDialog";

const ACTION_TYPE_LABELS: Record<TaskAction["type"], string> = {
  exec: "Programm starten",
  sendEmail: "E-Mail senden (wird nicht mehr unterstützt)",
  showMessage: "Nachricht anzeigen (wird nicht mehr unterstützt)",
};

function makeDefaultAction(type: TaskAction["type"]): TaskAction {
  const uid = crypto.randomUUID();
  if (type === "exec") return { uid, type, command: "" };
  if (type === "sendEmail") return { uid, type, server: "" };
  return { uid, type, title: "", body: "" };
}

/** Mirrors the real "Neue Aktion" dialog for a scheduled task. */
export function TaskActionDialog({
  action,
  onClose,
  onSave,
}: {
  action?: TaskAction;
  onClose: () => void;
  onSave: (a: TaskAction) => void;
}) {
  const [a, setA] = useState<TaskAction>(action ?? makeDefaultAction("exec"));

  function changeType(type: TaskAction["type"]) {
    setA((prev) => ({ ...makeDefaultAction(type), uid: prev.uid }));
  }

  const valid = a.type === "exec" ? a.command.trim().length > 0 : a.type === "sendEmail" ? a.server.trim().length > 0 : a.title.trim().length > 0;

  return (
    <WindowsDialog
      title="Neue Aktion"
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      footer={
        <>
          <WindowsButton variant="primary" disabled={!valid} onClick={() => onSave(a)}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Aktion:</WinLabel>
          <WinSelect value={a.type} onChange={(e) => changeType(e.target.value as TaskAction["type"])}>
            {(Object.keys(ACTION_TYPE_LABELS) as TaskAction["type"][]).map((type) => (
              <option key={type} value={type}>
                {ACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </WinSelect>
        </div>

        {a.type === "exec" && (
          <>
            <div>
              <WinLabel>Programm/Skript:</WinLabel>
              <WinInput value={a.command} onChange={(e) => setA({ ...a, command: e.target.value })} placeholder="C:\Windows\System32\cmd.exe" autoFocus />
            </div>
            <div>
              <WinLabel>Argumente hinzufügen (optional):</WinLabel>
              <WinInput value={a.arguments ?? ""} onChange={(e) => setA({ ...a, arguments: e.target.value || undefined })} />
            </div>
            <div>
              <WinLabel>Starten in (optional):</WinLabel>
              <WinInput value={a.workingDirectory ?? ""} onChange={(e) => setA({ ...a, workingDirectory: e.target.value || undefined })} />
            </div>
          </>
        )}

        {a.type === "sendEmail" && (
          <>
            <div>
              <WinLabel>Von:</WinLabel>
              <WinInput value={a.from ?? ""} onChange={(e) => setA({ ...a, from: e.target.value || undefined })} />
            </div>
            <div>
              <WinLabel>An:</WinLabel>
              <WinInput value={a.to ?? ""} onChange={(e) => setA({ ...a, to: e.target.value || undefined })} />
            </div>
            <div>
              <WinLabel>Cc:</WinLabel>
              <WinInput value={a.cc ?? ""} onChange={(e) => setA({ ...a, cc: e.target.value || undefined })} />
            </div>
            <div>
              <WinLabel>Betreff:</WinLabel>
              <WinInput value={a.subject ?? ""} onChange={(e) => setA({ ...a, subject: e.target.value || undefined })} />
            </div>
            <div>
              <WinLabel>Text:</WinLabel>
              <WinTextarea value={a.body ?? ""} onChange={(e) => setA({ ...a, body: e.target.value || undefined })} rows={3} />
            </div>
            <div>
              <WinLabel>SMTP-Server:</WinLabel>
              <WinInput value={a.server} onChange={(e) => setA({ ...a, server: e.target.value })} />
            </div>
          </>
        )}

        {a.type === "showMessage" && (
          <>
            <div>
              <WinLabel>Titel:</WinLabel>
              <WinInput value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} autoFocus />
            </div>
            <div>
              <WinLabel>Nachricht:</WinLabel>
              <WinTextarea value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} rows={3} />
            </div>
          </>
        )}
      </div>
    </WindowsDialog>
  );
}
