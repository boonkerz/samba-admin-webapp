import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DnsRecord } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { useDnsNodeQuery } from "./useDnsNode";

export interface EditRecordTarget {
  zone: string;
  fullName: string;
  record: DnsRecord;
}

const TYPE_LABEL: Record<string, string> = {
  A: "Host (A)",
  AAAA: "IPv6 Host (AAAA)",
  CNAME: "Alias (CNAME)",
  MX: "Mailaustausch (MX)",
  NS: "Namenserver (NS)",
  PTR: "Zeiger (PTR)",
  SOA: "Autoritätsursprung (SOA)",
  SRV: "Dienstspeicherort (SRV)",
  TXT: "Text (TXT)",
};

const SAME_AS_PARENT = "(identisch mit übergeordnetem Ordner)";

interface SubfolderRow {
  name: string;
  onClick: () => void;
}

/**
 * Combined folder+record list for the selected zone/node, matching real
 * DNS-Manager's list pane exactly: sub-domains that have their own children
 * appear as navigable folder rows, this node's own apex records show the
 * "(identisch mit übergeordnetem Ordner)" placeholder, and leaf children
 * (plain host records with no further structure) are inlined directly by
 * name rather than requiring a separate click into their own tree node.
 */
export function DnsRecordTable({
  title,
  isLoading,
  zone,
  fullName,
  ownRecords,
  subfolders,
  leaves,
  onEdit,
}: {
  title: string;
  isLoading: boolean;
  zone: string;
  fullName: string;
  ownRecords: DnsRecord[];
  subfolders: SubfolderRow[];
  leaves: string[];
  onEdit: (target: EditRecordTarget) => void;
}) {
  const isEmpty = !isLoading && ownRecords.length === 0 && subfolders.length === 0 && leaves.length === 0;

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {isLoading ? (
        <p className="text-sm text-slate-400">Lade…</p>
      ) : isEmpty ? (
        <p className="text-sm text-slate-400">Keine Einträge.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-600">
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Typ</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">Daten</th>
              <th className="px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300">TTL</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {subfolders.map((f) => (
              <FolderRow key={f.name} name={f.name} onClick={f.onClick} />
            ))}
            {ownRecords.map((r, i) => (
              <RecordRow key={`own-${i}`} name={SAME_AS_PARENT} zone={zone} fullName={fullName} record={r} onEdit={onEdit} />
            ))}
            {leaves.map((leafName) => (
              <LeafRecordRows key={leafName} zone={zone} leafName={leafName} parentFullName={fullName} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FolderRow({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" onClick={onClick}>
      <td className="px-2 py-1 text-slate-700 dark:text-slate-300" colSpan={4}>
        <span className="inline-flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path
              d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z"
              fill="#fbbf24"
              stroke="#d97706"
              strokeWidth="0.4"
            />
            <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#fcd34d" />
          </svg>
          {name}
        </span>
      </td>
      <td />
    </tr>
  );
}

function RecordRow({
  name,
  zone,
  fullName,
  record,
  onEdit,
}: {
  name: string;
  zone: string;
  fullName: string;
  record: DnsRecord;
  onEdit: (target: EditRecordTarget) => void;
}) {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete(`/api/dns/zones/${encodeURIComponent(zone)}/records`, { name: fullName, type: record.type, data: record.data }),
    onSuccess: () => {
      pushToast("success", "Eintrag gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["dns-node"] });
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{name}</td>
      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{TYPE_LABEL[record.type] ?? record.type}</td>
      <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{record.displayData}</td>
      <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{record.ttlSeconds}s</td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        {record.type !== "SOA" && (
          <button className="mr-3 text-xs text-indigo-600 hover:underline" onClick={() => onEdit({ zone, fullName, record })}>
            Bearbeiten
          </button>
        )}
        <button
          className="text-xs text-red-600 hover:underline"
          onClick={() => {
            if (confirm(`Eintrag "${TYPE_LABEL[record.type] ?? record.type}: ${record.displayData}" wirklich löschen?`)) {
              deleteMutation.mutate();
            }
          }}
        >
          Entfernen
        </button>
      </td>
    </tr>
  );
}

/** Fetches and inlines one leaf child's own records — leaf children never get a separate tree node. */
function LeafRecordRows({
  zone,
  leafName,
  parentFullName,
  onEdit,
}: {
  zone: string;
  leafName: string;
  parentFullName: string;
  onEdit: (target: EditRecordTarget) => void;
}) {
  const query = useDnsNodeQuery(zone, leafName, true);
  const own = (query.data ?? []).find((n) => n.name === "");
  if (!own) return null;
  const fullName = parentFullName === "@" ? leafName : `${leafName}.${parentFullName}`;
  return (
    <>
      {own.records.map((r, i) => (
        <RecordRow key={`${leafName}-${i}`} name={leafName} zone={zone} fullName={fullName} record={r} onEdit={onEdit} />
      ))}
    </>
  );
}
