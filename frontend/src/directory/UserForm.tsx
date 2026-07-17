import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserRequest, SetupSummary } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinCheckbox } from "../components/WindowsDialog";
import { dnToPath } from "./dnPath";

type Step = 1 | 2 | 3;

/** Mirrors the classic ADUC "New Object - User" wizard: name/logon, then password/options, then a summary. */
export function NewUserWizard({ parentOuDn, onDone }: { parentOuDn: string; onDone: () => void }) {
  const [step, setStep] = useState<Step>(1);

  const [givenName, setGivenName] = useState("");
  const [initials, setInitials] = useState("");
  const [sn, setSn] = useState("");
  const [fullName, setFullName] = useState("");
  const [fullNameTouched, setFullNameTouched] = useState(false);
  const [logonName, setLogonName] = useState("");
  const [samAccountName, setSamAccountName] = useState("");
  const [samTouched, setSamTouched] = useState(false);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [neverExpires, setNeverExpires] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const summaryQuery = useQuery({ queryKey: ["setup-summary"], queryFn: () => api.get<SetupSummary>("/api/setup/summary") });
  const realm = summaryQuery.data?.realm ?? "";
  const netbios = summaryQuery.data?.domain ?? "";

  useEffect(() => {
    if (!fullNameTouched) setFullName(`${givenName} ${sn}`.trim());
  }, [givenName, sn, fullNameTouched]);

  useEffect(() => {
    if (!samTouched) setSamAccountName(logonName);
  }, [logonName, samTouched]);

  const createMutation = useMutation({
    mutationFn: (req: CreateUserRequest) => api.post("/api/directory/users", req),
    onSuccess: () => {
      pushToast("success", "Benutzer erstellt.");
      queryClient.invalidateQueries({ queryKey: ["objects", parentOuDn] });
      onDone();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const step1Valid = fullName.trim().length > 0 && logonName.trim().length > 0 && samAccountName.trim().length > 0;
  const step2Valid = password.length > 0 && password === passwordConfirm;

  function submit() {
    createMutation.mutate({
      parentOuDn,
      sAMAccountName: samAccountName,
      givenName: givenName || undefined,
      sn: sn || undefined,
      initials: initials || undefined,
      fullName,
      userPrincipalName: `${logonName}@${realm}`,
      password,
      enabled: !disabled,
      mustChangePasswordAtNextLogon: mustChangePassword,
      passwordNeverExpires: neverExpires,
    });
  }

  return (
    <WindowsDialog
      title="Neues Objekt - Benutzer"
      icon={<span className="text-2xl">👤</span>}
      createIn={dnToPath(parentOuDn)}
      onClose={onDone}
      footer={
        <>
          <WindowsButton disabled={step === 1} onClick={() => setStep((s) => (s - 1) as Step)}>
            {"< Zurück"}
          </WindowsButton>
          {step < 3 ? (
            <WindowsButton
              variant="primary"
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              {"Weiter >"}
            </WindowsButton>
          ) : (
            <WindowsButton variant="primary" onClick={submit} disabled={createMutation.isPending}>
              Fertig stellen
            </WindowsButton>
          )}
          <WindowsButton onClick={onDone}>Abbrechen</WindowsButton>
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <WinLabel>Vorname:</WinLabel>
              <WinInput value={givenName} onChange={(e) => setGivenName(e.target.value)} autoFocus />
            </div>
            <div className="w-20">
              <WinLabel>Initialen:</WinLabel>
              <WinInput value={initials} onChange={(e) => setInitials(e.target.value)} maxLength={6} />
            </div>
          </div>
          <div>
            <WinLabel>Nachname:</WinLabel>
            <WinInput value={sn} onChange={(e) => setSn(e.target.value)} />
          </div>
          <div>
            <WinLabel>Vollständiger Name:</WinLabel>
            <WinInput
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setFullNameTouched(true);
              }}
            />
          </div>
          <div>
            <WinLabel>Benutzeranmeldename:</WinLabel>
            <div className="flex gap-2">
              <WinInput value={logonName} onChange={(e) => setLogonName(e.target.value)} className="flex-1" />
              <div className="flex items-center rounded-sm border border-slate-400 bg-slate-100 px-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                @{realm || "…"}
              </div>
            </div>
          </div>
          <div>
            <WinLabel>Benutzeranmeldename (Prä-Windows 2000):</WinLabel>
            <div className="flex gap-2">
              <div className="flex items-center rounded-sm border border-slate-400 bg-slate-100 px-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {netbios || "…"}\
              </div>
              <WinInput
                value={samAccountName}
                onChange={(e) => {
                  setSamAccountName(e.target.value);
                  setSamTouched(true);
                }}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <WinLabel>Passwort:</WinLabel>
            <WinInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <div>
            <WinLabel>Passwort bestätigen:</WinLabel>
            <WinInput type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
          </div>
          {password && passwordConfirm && password !== passwordConfirm && (
            <p className="text-xs text-red-600 dark:text-red-400">Die Passwörter stimmen nicht überein.</p>
          )}
          <div className="space-y-2 pt-2">
            <WinCheckbox
              label="Benutzer muss Kennwort bei der nächsten Anmeldung ändern"
              checked={mustChangePassword}
              onChange={(e) => {
                setMustChangePassword(e.target.checked);
                if (e.target.checked) setNeverExpires(false);
              }}
            />
            <WinCheckbox
              label="Kennwort läuft nie ab"
              checked={neverExpires}
              onChange={(e) => {
                setNeverExpires(e.target.checked);
                if (e.target.checked) setMustChangePassword(false);
              }}
            />
            <WinCheckbox label="Konto ist deaktiviert" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2 text-sm">
          <p className="mb-3 text-slate-600 dark:text-slate-400">
            Es wird folgender Benutzer erstellt. Klicken Sie auf "Fertig stellen", um fortzufahren.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Vollständiger Name:</dt>
            <dd className="text-slate-900 dark:text-slate-100">{fullName}</dd>
            <dt className="text-slate-500">Benutzeranmeldename:</dt>
            <dd className="text-slate-900 dark:text-slate-100">
              {logonName}@{realm}
            </dd>
            <dt className="text-slate-500">Kontooptionen:</dt>
            <dd className="text-slate-900 dark:text-slate-100">
              {[
                mustChangePassword && "Kennwortänderung bei nächster Anmeldung erforderlich",
                neverExpires && "Kennwort läuft nie ab",
                disabled && "Konto deaktiviert",
              ]
                .filter(Boolean)
                .join(", ") || "Keine"}
            </dd>
          </dl>
        </div>
      )}
    </WindowsDialog>
  );
}

/** Mirrors ADUC's "Kennwort zurücksetzen..." context-menu dialog. */
export function ResetPasswordDialog({ userDn, userName, onClose }: { userDn: string; userName: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const pushToast = useToastStore((s) => s.push);

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/api/directory/users/${encodeURIComponent(userDn)}/reset-password`, { newPassword: password }),
    onSuccess: () => {
      pushToast("success", "Passwort zurückgesetzt.");
      onClose();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  const valid = password.length > 0 && password === passwordConfirm;

  return (
    <WindowsDialog
      title={`Kennwort zurücksetzen für ${userName}`}
      onClose={onClose}
      footer={
        <>
          <WindowsButton variant="primary" disabled={!valid || resetPassword.isPending} onClick={() => resetPassword.mutate()}>
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <WinLabel>Neues Passwort:</WinLabel>
          <WinInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <div>
          <WinLabel>Passwort bestätigen:</WinLabel>
          <WinInput type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
        </div>
        {password && passwordConfirm && password !== passwordConfirm && (
          <p className="text-xs text-red-600 dark:text-red-400">Die Passwörter stimmen nicht überein.</p>
        )}
      </div>
    </WindowsDialog>
  );
}
