import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { editor } from "monaco-editor";
import type { GpoObject, GpoScript, ScriptEvent, ScriptKind } from "@samba-admin/shared";
import { api } from "../api/client";
import { WindowsDialog, WindowsButton, WinInput, WinLabel, WinSelect } from "../components/WindowsDialog";
import { useToastStore } from "../state/toastStore";
import { useThemeStore } from "../state/themeStore";
import { templatesForKind } from "./scriptTemplates";

// Self-host Monaco instead of @monaco-editor/react's default jsdelivr CDN
// fetch — this app must keep working with no internet access from the
// browser (it's an on-prem tool talking to an internal DC). This whole
// module (and monaco-editor with it) is only loaded lazily when a script
// dialog actually opens — see ScriptsPanel.tsx's React.lazy() import —
// so this multi-MB dependency never bloats the main bundle.
loader.config({ monaco });

const KIND_OPTIONS: { value: ScriptKind; label: string; defaultFileName: string }[] = [
  { value: "script", label: "Skript (Batch/VBScript)", defaultFileName: "script.bat" },
  { value: "powershell", label: "PowerShell-Skript", defaultFileName: "script.ps1" },
];

function languageFor(kind: ScriptKind, fileName: string): string {
  if (kind === "powershell") return "powershell";
  if (/\.vbs$/i.test(fileName)) return "vb";
  return "bat";
}

function useSaveScript(gpo: GpoObject, scope: "machine" | "user", uid: string | undefined, onSaved: () => void) {
  const pushToast = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (body: unknown) =>
      uid ? api.put(`/api/gpo/${gpo.guid}/scripts/${scope}/${uid}`, body) : api.post(`/api/gpo/${gpo.guid}/scripts/${scope}`, body),
    onSuccess: () => {
      pushToast("success", uid ? "Skript aktualisiert." : "Skript erstellt.");
      onSaved();
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });
}

/** In-browser script editor for the classic GPO Scripts extension — Monaco gives real syntax highlighting for Batch/VBScript/PowerShell instead of a plain textarea. */
export function ScriptEditorDialog({
  gpo,
  scope,
  event,
  item,
  onClose,
  onSaved,
}: {
  gpo: GpoObject;
  scope: "machine" | "user";
  event: ScriptEvent;
  item?: GpoScript;
  onClose: () => void;
  onSaved: () => void;
}) {
  const themeMode = useThemeStore((s) => s.mode);
  const isDark = themeMode === "dark" || (themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [kind, setKind] = useState<ScriptKind>(item?.kind ?? "script");
  const [fileName, setFileName] = useState(item?.fileName ?? KIND_OPTIONS[0].defaultFileName);
  const [parameters, setParameters] = useState(item?.parameters ?? "");
  const [content, setContent] = useState(item?.content ?? "");
  const saveMutation = useSaveScript(gpo, scope, item?.uid, onSaved);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const valid = fileName.trim().length > 0 && !/[/\\]/.test(fileName);

  function insertTemplate(templateContent: string) {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;
    editorInstance.trigger("template-picker", "type", { text: templateContent });
    editorInstance.focus();
  }

  return (
    <WindowsDialog
      title={item ? `Skript bearbeiten: ${item.fileName}` : "Neues Skript"}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footer={
        <>
          <WindowsButton
            variant="primary"
            disabled={!valid || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ event, kind, fileName, parameters, content })}
          >
            OK
          </WindowsButton>
          <WindowsButton onClick={onClose}>Abbrechen</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <WinLabel>Typ:</WinLabel>
            <WinSelect
              value={kind}
              disabled={!!item}
              onChange={(e) => {
                const next = e.target.value as ScriptKind;
                setKind(next);
                if (!item) setFileName(KIND_OPTIONS.find((k) => k.value === next)!.defaultFileName);
              }}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </WinSelect>
          </div>
          <div>
            <WinLabel>Dateiname:</WinLabel>
            <WinInput value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="script.bat" autoFocus />
          </div>
        </div>
        <div>
          <WinLabel>Parameter:</WinLabel>
          <WinInput value={parameters} onChange={(e) => setParameters(e.target.value)} placeholder="/silent" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <WinLabel>Skriptinhalt:</WinLabel>
            <WinSelect
              value=""
              className="max-w-xs"
              onChange={(e) => {
                const template = templatesForKind(kind).find((t) => t.id === e.target.value);
                if (template) insertTemplate(template.content);
                e.target.value = "";
              }}
            >
              <option value="">Vorlage einfügen...</option>
              {templatesForKind(kind).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </WinSelect>
          </div>
          <div className="overflow-hidden rounded-sm border border-slate-400 dark:border-slate-600">
            <Editor
              height="320px"
              language={languageFor(kind, fileName)}
              value={content}
              onChange={(v) => setContent(v ?? "")}
              onMount={(editorInstance) => {
                editorRef.current = editorInstance;
              }}
              theme={isDark ? "vs-dark" : "vs"}
              options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
            />
          </div>
        </div>
      </div>
    </WindowsDialog>
  );
}
