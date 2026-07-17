import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateOuRequest } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { dnToPath } from "./dnPath";

/** Mirrors the classic ADUC "New Object - Organizational Unit" dialog. */
export function NewOuDialog({ parentDn, onDone }: { parentDn: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const createMutation = useMutation({
    mutationFn: (req: CreateOuRequest) => api.post("/api/directory/ous", req),
    onSuccess: () => {
      pushToast("success", "Organisationseinheit erstellt.");
      queryClient.invalidateQueries({ queryKey: ["objects", parentDn] });
      queryClient.invalidateQueries({ queryKey: ["tree-children", parentDn] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = name.trim().length > 0;

  return (
    <WindowsDialog
      title="Neues Objekt - Organisationseinheit"
      icon={<span className="text-2xl">📁</span>}
      createIn={dnToPath(parentDn)}
      onClose={onDone}
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || createMutation.isPending}
            onClick={() => createMutation.mutate({ parentDn, name, description })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Beschreibung:</WinLabel>
          <WinInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </WindowsDialog>
  );
}
