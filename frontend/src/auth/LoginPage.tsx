import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { LoginResponse } from "@samba-admin/shared";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { Field, TextInput } from "../components/Field";
import { Spinner } from "../components/Spinner";

export function LoginPage({ onLoggedIn }: { onLoggedIn: (identity: LoginResponse) => void }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("administrator");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const identity = await api.post<LoginResponse>("/api/auth/login", { username, password });
      onLoggedIn(identity);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("login.subtitle")}</p>
        </div>

        <Field label={t("login.username")}>
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </Field>

        <Field label={t("login.password")}>
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Spinner className="h-4 w-4" />} {t("login.submit")}
        </Button>
      </form>
    </div>
  );
}
