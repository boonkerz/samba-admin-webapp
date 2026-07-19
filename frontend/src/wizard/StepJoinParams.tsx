import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { JoinDomainParams, JoinValidationResult } from "@samba-admin/shared";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Field, TextInput } from "../components/Field";
import { Spinner } from "../components/Spinner";

export function StepJoinParams({ onStarted }: { onStarted: (jobId: string) => void }) {
  const { t } = useTranslation();
  const [realm, setRealm] = useState("");
  const [existingDcAddress, setExistingDcAddress] = useState("");
  const [joinUsername, setJoinUsername] = useState("administrator");
  const [joinPassword, setJoinPassword] = useState("");
  const [errors, setErrors] = useState<JoinValidationResult["errors"]>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  async function submit() {
    setSubmitting(true);
    setServerError(undefined);
    const params: JoinDomainParams = {
      realm: realm.toUpperCase(),
      existingDcAddress,
      joinUsername,
      joinPassword,
    };

    try {
      const validation = await api.post<JoinValidationResult>("/api/setup/join/validate", params);
      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }
      const { jobId } = await api.post<{ jobId: string }>("/api/setup/join", params);
      onStarted(jobId);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t("wizard.join.title", "Bestehender Domäne beitreten")}</h2>

      <Field label={t("wizard.join.realmLabel", "Realm der bestehenden Domäne (z. B. CORP.EXAMPLE.COM)")} error={errors.realm}>
        <TextInput value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="CORP.EXAMPLE.COM" />
      </Field>

      <Field
        label={t("wizard.join.dcAddressLabel", "Adresse eines vorhandenen Domain Controllers (IP oder Hostname)")}
        error={errors.existingDcAddress}
      >
        <TextInput value={existingDcAddress} onChange={(e) => setExistingDcAddress(e.target.value)} placeholder="192.168.1.10" />
      </Field>

      <Field label={t("wizard.join.usernameLabel", "Benutzername (Domänenkonto mit Beitrittsrechten)")} error={errors.joinUsername}>
        <TextInput value={joinUsername} onChange={(e) => setJoinUsername(e.target.value)} />
      </Field>

      <Field label={t("wizard.join.passwordLabel", "Passwort")} error={errors.joinPassword}>
        <TextInput type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} />
      </Field>

      {serverError && <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Spinner className="h-4 w-4" />} {t("wizard.join.submit", "Domäne beitreten")}
        </Button>
      </div>
    </div>
  );
}
