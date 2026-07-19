import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FileShareSummary,
  FsAccessLevel,
  FsAclEntry,
  FsAclInfo,
  ShareAccessMask,
  ShareAce,
  UpdateFileShareRequest,
} from "@samba-admin/shared";
import { api } from "../api/client";
import { useJobStream } from "../api/useJobStream";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect, WinCheckbox, type WinTab } from "../components/WindowsDialog";
import { LogConsole } from "../components/LogConsole";
import { useToastStore } from "../state/toastStore";
import { ObjectPickerDialog, type PickedObject } from "../components/ObjectPickerDialog";

const TABS: WinTab[] = [
  { id: "general", label: "General" },
  { id: "sharePermissions", label: "Share Permissions" },
  { id: "security", label: "Security" },
];

export function FileSharePropertiesDialog({ share, onDone }: { share: FileShareSummary; onDone: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("general");
  const tabsLabeled: WinTab[] = TABS.map((tb) => ({
    ...tb,
    label:
      tb.id === "general"
        ? t("fileShares.tabGeneral", "General")
        : tb.id === "sharePermissions"
          ? t("fileShares.tabSharePermissions", "Share Permissions")
          : t("fileShares.tabSecurity", "Security"),
  }));

  return (
    <WindowsDialog
      title={t("fileShares.propertiesTitle", "Properties: {{name}}", { name: share.name })}
      onClose={onDone}
      tabs={tabsLabeled}
      activeTab={tab}
      onTabChange={setTab}
      maxWidthClassName="max-w-2xl"
      footer={<WindowsButton onClick={onDone}>{t("common.close", "Schließen")}</WindowsButton>}
    >
      {tab === "general" && <GeneralTab share={share} />}
      {tab === "sharePermissions" && <SharePermissionsTab shareName={share.name} />}
      {tab === "security" && <SecurityTab shareName={share.name} />}
    </WindowsDialog>
  );
}

function GeneralTab({ share }: { share: FileShareSummary }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [path, setPath] = useState(share.path);
  const [comment, setComment] = useState(share.comment ?? "");
  const [browseable, setBrowseable] = useState(share.browseable);
  const [readOnly, setReadOnly] = useState(share.readOnly);
  const [jobId, setJobId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();
  const stream = useJobStream(jobId, "/api/fileshares");

  useEffect(() => {
    if (stream.status === "succeeded") {
      pushToast("success", t("fileShares.updated", "Share updated."));
      queryClient.invalidateQueries({ queryKey: ["fileshares"] });
    }
  }, [stream.status]);

  async function save() {
    setSubmitting(true);
    setServerError(undefined);
    try {
      const body: UpdateFileShareRequest = { path, comment: comment || undefined, browseable, readOnly };
      const { jobId } = await api.put<{ jobId: string }>(`/api/fileshares/${encodeURIComponent(share.name)}`, body);
      setJobId(jobId);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const running = !!jobId && stream.status === "running";

  return (
    <div className="space-y-3">
      <div>
        <WinLabel>{t("fileShares.pathLabel", "Folder path:")}</WinLabel>
        <WinInput value={path} onChange={(e) => setPath(e.target.value)} disabled={running} />
      </div>
      <div>
        <WinLabel>{t("fileShares.commentLabel", "Description (optional):")}</WinLabel>
        <WinInput value={comment} onChange={(e) => setComment(e.target.value)} disabled={running} />
      </div>
      <WinCheckbox
        label={t("fileShares.browseableLabel", "Browseable")}
        checked={browseable}
        onChange={(e) => setBrowseable(e.target.checked)}
        disabled={running}
      />
      <WinCheckbox
        label={t("fileShares.readOnlyLabel", "Read-only")}
        checked={readOnly}
        onChange={(e) => setReadOnly(e.target.checked)}
        disabled={running}
      />
      {serverError && <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>}
      <div className="flex items-center gap-3">
        <WindowsButton variant="primary" disabled={submitting || running} onClick={save}>
          {t("fileShares.save", "Save")}
        </WindowsButton>
      </div>
      {jobId && stream.lines.length > 0 && <LogConsole lines={stream.lines} />}
      {stream.status === "failed" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {t("fileShares.updateFailed", "Failed (exit code {{code}}). Please check the log.", { code: stream.exitCode })}
        </p>
      )}
    </div>
  );
}

const SHARE_MASKS: ShareAccessMask[] = ["FULL", "CHANGE", "READ"];

function SharePermissionsTab({ shareName }: { shareName: string }) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [rows, setRows] = useState<ShareAce[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const query = useQuery({
    queryKey: ["fileshare-share-acl", shareName],
    queryFn: () => api.get<ShareAce[]>(`/api/fileshares/${encodeURIComponent(shareName)}/share-acl`),
  });

  useEffect(() => {
    if (query.data && rows === null) setRows(query.data);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (aces: ShareAce[]) => api.put(`/api/fileshares/${encodeURIComponent(shareName)}/share-acl`, { aces }),
    onSuccess: () => pushToast("success", t("fileShares.savedSharePermissions", "Share permissions updated.")),
    onError: (err) => pushToast("error", (err as Error).message),
    onSettled: () => setSaving(false),
  });

  if (!rows) return <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading", "Lade...")}</p>;

  function updateRow(index: number, patch: Partial<ShareAce>) {
    setRows((prev) => prev!.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t("fileShares.sharePermissionsHint", "Controls network access to the share itself (checked in addition to filesystem permissions).")}
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-1 py-1">{t("fileShares.trustee", "Trustee")}</th>
            <th className="px-1 py-1">{t("fileShares.accessType", "Type")}</th>
            <th className="px-1 py-1">{t("fileShares.permission", "Permission")}</th>
            <th className="px-1 py-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="px-1 py-1">
                <WinInput value={row.trustee} onChange={(e) => updateRow(i, { trustee: e.target.value })} />
              </td>
              <td className="px-1 py-1">
                <WinSelect value={row.type} onChange={(e) => updateRow(i, { type: e.target.value as "ALLOWED" | "DENIED" })}>
                  <option value="ALLOWED">{t("fileShares.allowed", "Allow")}</option>
                  <option value="DENIED">{t("fileShares.denied", "Deny")}</option>
                </WinSelect>
              </td>
              <td className="px-1 py-1">
                <WinSelect value={row.mask} onChange={(e) => updateRow(i, { mask: e.target.value as ShareAccessMask })}>
                  {SHARE_MASKS.map((m) => (
                    <option key={m} value={m}>
                      {m === "FULL" ? t("fileShares.full", "Full Control") : m === "CHANGE" ? t("fileShares.change", "Change") : t("fileShares.read", "Read")}
                    </option>
                  ))}
                </WinSelect>
              </td>
              <td className="px-1 py-1 text-right">
                <button
                  className="text-red-600 hover:underline dark:text-red-400"
                  onClick={() => setRows((prev) => prev!.filter((_, idx) => idx !== i))}
                >
                  {t("fileShares.removeEntry", "Remove")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setShowPicker(true)}>
        {t("fileShares.addEntry", "Add...")}
      </button>
      <div>
        <WindowsButton
          variant="primary"
          disabled={saving || rows.length === 0}
          onClick={() => {
            setSaving(true);
            saveMutation.mutate(rows);
          }}
        >
          {t("fileShares.save", "Save")}
        </WindowsButton>
      </div>
      {showPicker && (
        <ObjectPickerDialog
          onClose={() => setShowPicker(false)}
          onSelect={(picked: PickedObject) => {
            setRows((prev) => [...(prev ?? []), { trustee: picked.name, type: "ALLOWED", mask: "READ" }]);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}

const FS_LEVELS: FsAccessLevel[] = ["FULL_CONTROL", "READ_EXECUTE", "READ", "WRITE"];

function fsLevelLabel(level: FsAccessLevel, t: (key: string, fallback: string) => string): string {
  switch (level) {
    case "FULL_CONTROL":
      return t("fileShares.fullControl", "Full Control");
    case "READ_EXECUTE":
      return t("fileShares.readExecute", "Read & Execute");
    case "READ":
      return t("fileShares.read", "Read");
    case "WRITE":
      return t("fileShares.write", "Write");
  }
}

function SecurityTab({ shareName }: { shareName: string }) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [entries, setEntries] = useState<FsAclEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const query = useQuery({
    queryKey: ["fileshare-fs-acl", shareName],
    queryFn: () => api.get<FsAclInfo>(`/api/fileshares/${encodeURIComponent(shareName)}/fs-acl`),
  });

  useEffect(() => {
    if (query.data && entries === null) setEntries(query.data.entries);
  }, [query.data]);

  const saveMutation = useMutation({
    mutationFn: (body: FsAclEntry[]) => api.put(`/api/fileshares/${encodeURIComponent(shareName)}/fs-acl`, { entries: body }),
    onSuccess: () => pushToast("success", t("fileShares.savedFsPermissions", "Filesystem permissions updated.")),
    onError: (err) => pushToast("error", (err as Error).message),
    onSettled: () => setSaving(false),
  });

  if (!entries) return <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading", "Lade...")}</p>;

  function updateEntry(index: number, level: FsAccessLevel) {
    setEntries((prev) => prev!.map((e, i) => (i === index ? { ...e, level } : e)));
  }

  function rowLabel(entry: FsAclEntry): string {
    if (entry.kind === "owner") return `${t("fileShares.owner", "Owner")} (${entry.trustee})`;
    if (entry.kind === "group") return `${t("fileShares.group", "Group")} (${entry.trustee})`;
    if (entry.kind === "other") return t("fileShares.other", "Other");
    return entry.trustee;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {t(
          "fileShares.securityHint",
          "Filesystem permissions on the underlying folder, backed by POSIX ACLs. Applies to new files/subfolders too."
        )}
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-1 py-1">{t("fileShares.trustee", "Trustee")}</th>
            <th className="px-1 py-1">{t("fileShares.permission", "Permission")}</th>
            <th className="px-1 py-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map((entry, i) => (
            <tr key={i}>
              <td className="px-1 py-1">
                {entry.kind === "user" || entry.kind === "group-named" ? (
                  <WinInput value={entry.trustee} onChange={(e) => setEntries((prev) => prev!.map((en, idx) => (idx === i ? { ...en, trustee: e.target.value } : en)))} />
                ) : (
                  <span className="text-slate-700 dark:text-slate-300">{rowLabel(entry)}</span>
                )}
              </td>
              <td className="px-1 py-1">
                <WinSelect value={entry.level} onChange={(e) => updateEntry(i, e.target.value as FsAccessLevel)}>
                  {FS_LEVELS.map((lv) => (
                    <option key={lv} value={lv}>
                      {fsLevelLabel(lv, t)}
                    </option>
                  ))}
                </WinSelect>
              </td>
              <td className="px-1 py-1 text-right">
                {(entry.kind === "user" || entry.kind === "group-named") && (
                  <button
                    className="text-red-600 hover:underline dark:text-red-400"
                    onClick={() => setEntries((prev) => prev!.filter((_, idx) => idx !== i))}
                  >
                    {t("fileShares.removeEntry", "Remove")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="text-sm text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setShowPicker(true)}>
        {t("fileShares.addEntry", "Add...")}
      </button>
      <div>
        <WindowsButton
          variant="primary"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            saveMutation.mutate(entries);
          }}
        >
          {t("fileShares.save", "Save")}
        </WindowsButton>
      </div>
      {showPicker && (
        <ObjectPickerDialog
          onClose={() => setShowPicker(false)}
          onSelect={(picked: PickedObject) => {
            setEntries((prev) => [
              ...(prev ?? []),
              { kind: picked.type === "user" ? "user" : "group-named", trustee: picked.name, level: "READ" },
            ]);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}
