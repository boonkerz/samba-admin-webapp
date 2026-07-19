import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Field, TextInput } from "../components/Field";
import { Spinner } from "../components/Spinner";

const SERVER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,14}$/;

export function StepRestoreParams({ onStarted }: { onStarted: (jobId: string) => void }) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [newServerName, setNewServerName] = useState("");
  const [hostIp, setHostIp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  async function submit() {
    setSubmitting(true);
    setServerError(undefined);
    try {
      const formData = new FormData();
      formData.append("file", file!);
      formData.append("newServerName", newServerName);
      if (hostIp.trim()) formData.append("hostIp", hostIp.trim());
      const { jobId } = await api.upload<{ jobId: string }>("/api/setup/restore", formData);
      onStarted(jobId);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const isTar = file?.name.toLowerCase().endsWith(".tar.bz2") ?? false;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t("wizard.restore.title", "Aus Sicherung wiederherstellen")}</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("wizard.restore.fileLabel", "Sicherungsdatei (.tar.bz2)")}
        </label>
        <input type="file" accept=".bz2" onChange={handleFileChange} className="block w-full text-sm text-slate-700 dark:text-slate-300" />
        {file && !isTar && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {t("wizard.restore.fileTypeError", "Bitte eine .tar.bz2-Sicherungsdatei auswählen.")}
          </p>
        )}
      </div>

      <Field
        label={t("wizard.restore.serverNameLabel", "Servername (NetBIOS, max. 15 Zeichen)")}
        error={
          newServerName && !SERVER_NAME_RE.test(newServerName)
            ? t("wizard.restore.serverNameError", "1-15 Buchstaben/Ziffern/Bindestriche, kein Punkt.")
            : undefined
        }
      >
        <TextInput value={newServerName} onChange={(e) => setNewServerName(e.target.value)} placeholder="SAMBA" />
      </Field>

      <Field label={t("wizard.restore.hostIpLabel", "IP-Adresse (optional, wird sonst automatisch erkannt)")}>
        <TextInput value={hostIp} onChange={(e) => setHostIp(e.target.value)} placeholder="192.168.1.10" />
      </Field>

      {serverError && <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting || !file || !isTar || !SERVER_NAME_RE.test(newServerName)}>
          {submitting && <Spinner className="h-4 w-4" />} {t("wizard.restore.submit", "Wiederherstellen")}
        </Button>
      </div>
    </div>
  );
}
