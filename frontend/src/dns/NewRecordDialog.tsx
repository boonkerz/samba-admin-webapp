import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DnsRecordType } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinInput, WinLabel } from "../components/WindowsDialog";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { emptyRecordFieldState, buildFieldsPayload, isRecordFieldStateValid } from "./dnsRecordFields";
import { RecordFieldsInputs } from "./RecordFieldsInputs";

const TYPE_TITLES: Record<DnsRecordType, string> = {
  A: "Neuer Host (A)",
  AAAA: "Neuer Host (AAAA)",
  CNAME: "Neuer Alias (CNAME)",
  MX: "Neuer Mailaustausch (MX)",
  NS: "Neuer Namenserver (NS)",
  PTR: "Neuer Zeiger (PTR)",
  SRV: "Neuer Dienst (SRV)",
  TXT: "Neuer Texteintrag (TXT)",
  SOA: "Autorität (SOA)",
};

function combineName(name: string, parentFullName: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "@") return parentFullName;
  return parentFullName === "@" ? trimmed : `${trimmed}.${parentFullName}`;
}

/** One dialog covering every record type real DNS-Manager's "Neuer..." menu offers, fields switched by `type`. */
export function NewRecordDialog({
  zone,
  parentFullName,
  type,
  onDone,
}: {
  zone: string;
  parentFullName: string;
  type: DnsRecordType;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [fields, setFields] = useState(emptyRecordFieldState);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/dns/zones/${encodeURIComponent(zone)}/records`, {
        name: combineName(name, parentFullName),
        type,
        fields: buildFieldsPayload(type, fields),
      }),
    onSuccess: () => {
      pushToast("success", "Eintrag erstellt.");
      queryClient.invalidateQueries({ queryKey: ["dns-node"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = isRecordFieldStateValid(type, fields);

  return (
    <WindowsDialog
      title={TYPE_TITLES[type]}
      onClose={mutation.isPending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird erstellt…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" disabled={mutation.isPending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name (verwendet übergeordnete Domäne, falls leer):</WinLabel>
          <WinInput value={name} onChange={(e) => setName(e.target.value)} placeholder="@" autoFocus />
        </div>
        <RecordFieldsInputs type={type} state={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} />
      </div>
    </WindowsDialog>
  );
}
