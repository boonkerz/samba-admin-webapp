import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, encodeDn } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";

/** Mirrors ADUC's "Umbenennen" flow for computer objects (context-menu action, not part of Properties). */
export function RenameComputerDialog({
  computerDn,
  currentName,
  onClose,
  onRenamed,
}: {
  computerDn: string;
  currentName: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [newName, setNewName] = useState(currentName);
  const pushToast = useToastStore((s) => s.push);

  const renameMutation = useMutation({
    mutationFn: () => api.post(`/api/directory/computers/${encodeDn(computerDn)}/rename`, { newName }),
    onSuccess: () => {
      pushToast("success", "Computer umbenannt.");
      onRenamed();
      onClose();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = newName.trim().length > 0 && newName !== currentName;

  return (
    <WindowsDialog
      title={`"${currentName}" umbenennen`}
      onClose={onClose}
      footer={
        <>
          <WindowsButton variant="primary" disabled={!valid || renameMutation.isPending} onClick={() => renameMutation.mutate()}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div>
        <WinLabel>Neuer Name:</WinLabel>
        <WinInput value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
      </div>
    </WindowsDialog>
  );
}
