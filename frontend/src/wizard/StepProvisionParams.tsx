import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProvisionParams, ProvisionValidationResult } from "@samba-admin/shared";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Field, TextInput } from "../components/Field";
import { Spinner } from "../components/Spinner";

export function StepProvisionParams({ onStarted }: { onStarted: (jobId: string) => void }) {
  const { t } = useTranslation();
  const [realm, setRealm] = useState("");
  const [domain, setDomain] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<ProvisionValidationResult["errors"]>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string>();

  async function submit() {
    setSubmitting(true);
    setServerError(undefined);
    const params: ProvisionParams & { adminPasswordConfirm: string } = {
      realm: realm.toUpperCase(),
      domain: domain.toUpperCase(),
      adminPassword,
      adminPasswordConfirm,
      dnsBackend: "SAMBA_INTERNAL",
    };

    try {
      const validation = await api.post<ProvisionValidationResult>("/api/setup/provision/validate", params);
      if (!validation.valid) {
        setErrors(validation.errors);
        return;
      }
      const { jobId } = await api.post<{ jobId: string }>("/api/setup/provision", params);
      onStarted(jobId);
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{t("wizard.provision.title", "Domäne konfigurieren")}</h2>

      <Field label={t("wizard.provision.realmLabel", "Realm (z. B. CORP.EXAMPLE.COM)")} error={errors.realm}>
        <TextInput value={realm} onChange={(e) => setRealm(e.target.value)} placeholder="CORP.EXAMPLE.COM" />
      </Field>

      <Field label={t("wizard.provision.domainLabel", "Domäne / NetBIOS-Name (z. B. CORP)")} error={errors.domain}>
        <TextInput value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="CORP" />
      </Field>

      <Field label={t("wizard.provision.adminPasswordLabel", "Administrator-Passwort")} error={errors.adminPassword}>
        <TextInput type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
      </Field>

      <Field label={t("wizard.provision.confirmPasswordLabel", "Passwort bestätigen")} error={errors.adminPasswordConfirm}>
        <TextInput type="password" value={adminPasswordConfirm} onChange={(e) => setAdminPasswordConfirm(e.target.value)} />
      </Field>

      {serverError && <p className="text-sm text-red-600 dark:text-red-400">{serverError}</p>}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>
          {submitting && <Spinner className="h-4 w-4" />} {t("wizard.provision.submit", "Domäne provisionieren")}
        </Button>
      </div>
    </div>
  );
}
