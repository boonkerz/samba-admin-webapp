import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DnsRecord, DnsRecordType } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinLabel } from "../components/WindowsDialog";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { buildFieldsPayload, isRecordFieldStateValid, parseFieldsFromData } from "./dnsRecordFields";
import { RecordFieldsInputs } from "./RecordFieldsInputs";

const TYPE_TITLES: Record<DnsRecordType, string> = {
  A: "Host (A) bearbeiten",
  AAAA: "Host (AAAA) bearbeiten",
  CNAME: "Alias (CNAME) bearbeiten",
  MX: "Mailaustausch (MX) bearbeiten",
  NS: "Namenserver (NS) bearbeiten",
  PTR: "Zeiger (PTR) bearbeiten",
  SRV: "Dienst (SRV) bearbeiten",
  TXT: "Texteintrag (TXT) bearbeiten",
  SOA: "Autorität (SOA) bearbeiten",
};

/** Mirrors real DNS-Manager's record "Eigenschaften" dialog: same fields as creation, but the owner name is fixed. */
export function EditRecordDialog({
  zone,
  fullName,
  record,
  onDone,
}: {
  zone: string;
  fullName: string;
  record: DnsRecord;
  onDone: () => void;
}) {
  const [fields, setFields] = useState(() => parseFieldsFromData(record.type, record.data));

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/api/dns/zones/${encodeURIComponent(zone)}/records`, {
        name: fullName,
        type: record.type,
        oldData: record.data,
        newFields: buildFieldsPayload(record.type, fields),
      }),
    onSuccess: () => {
      pushToast("success", "Eintrag aktualisiert.");
      queryClient.invalidateQueries({ queryKey: ["dns-node"] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = isRecordFieldStateValid(record.type, fields);

  return (
    <WindowsDialog
      title={TYPE_TITLES[record.type]}
      onClose={mutation.isPending ? () => {} : onDone}
      footer={
        <>
          <WindowsButton type="button" variant="primary" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Wird gespeichert…" : "OK"}
          </WindowsButton>
          <WindowsButton type="button" disabled={mutation.isPending} onClick={onDone}>
            Abbrechen
          </WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Name:</WinLabel>
          <p className="text-sm text-slate-700 dark:text-slate-300">{fullName}</p>
        </div>
        <RecordFieldsInputs type={record.type} state={fields} onChange={(patch) => setFields((f) => ({ ...f, ...patch }))} />
      </div>
    </WindowsDialog>
  );
}
