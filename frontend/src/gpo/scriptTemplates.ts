import type { ScriptKind } from "@samba-admin/shared";

export interface ScriptTemplate {
  id: string;
  label: string;
  content: string;
}

const BATCH_TEMPLATES: ScriptTemplate[] = [
  {
    id: "mount-if-not-exists",
    label: "Laufwerk verbinden (falls nicht vorhanden)",
    content: `if not exist Z:\\ (\r\n    net use Z: \\\\server\\freigabe /persistent:yes\r\n)\r\n`,
  },
  {
    id: "mount-if-group",
    label: "Laufwerk verbinden (nur für Gruppenmitglieder)",
    content: `whoami /groups | find /i "Gruppenname" >nul\r\nif %errorlevel%==0 (\r\n    net use Y: \\\\server\\freigabe /persistent:yes\r\n)\r\n`,
  },
  {
    id: "connect-printer",
    label: "Netzwerkdrucker verbinden",
    content: `rundll32 printui.dll,PrintUIEntry /in /n "\\\\server\\drucker" /q\r\n`,
  },
  {
    id: "registry-set",
    label: "Registrierungswert setzen",
    content: `reg add "HKCU\\Software\\Contoso" /v Installed /t REG_DWORD /d 1 /f\r\n`,
  },
];

const POWERSHELL_TEMPLATES: ScriptTemplate[] = [
  {
    id: "mount-if-not-exists",
    label: "Laufwerk verbinden (falls nicht vorhanden)",
    content:
      `$driveLetter = "Z"\r\n` +
      `$networkPath = "\\\\server\\freigabe"\r\n\r\n` +
      `if (-not (Test-Path "$($driveLetter):")) {\r\n` +
      `    New-PSDrive -Name $driveLetter -PSProvider FileSystem -Root $networkPath -Persist -Scope Global\r\n` +
      `}\r\n`,
  },
  {
    id: "mount-if-group",
    label: "Laufwerk verbinden (nur für Gruppenmitglieder)",
    content:
      `$groupName = "Gruppenname"\r\n` +
      `$principal = New-Object System.Security.Principal.WindowsPrincipal([System.Security.Principal.WindowsIdentity]::GetCurrent())\r\n\r\n` +
      `if ($principal.IsInRole($groupName)) {\r\n` +
      `    New-PSDrive -Name "Y" -PSProvider FileSystem -Root "\\\\server\\freigabe" -Persist -Scope Global\r\n` +
      `}\r\n`,
  },
  {
    id: "connect-printer",
    label: "Netzwerkdrucker verbinden",
    content: `Add-Printer -ConnectionName "\\\\server\\drucker"\r\n`,
  },
  {
    id: "registry-set",
    label: "Registrierungswert setzen (falls nicht vorhanden)",
    content:
      `$path = "HKCU:\\Software\\Contoso"\r\n\r\n` +
      `if (-not (Test-Path $path)) {\r\n` +
      `    New-Item -Path $path -Force | Out-Null\r\n` +
      `}\r\n` +
      `Set-ItemProperty -Path $path -Name "Installed" -Value 1\r\n`,
  },
];

export function templatesForKind(kind: ScriptKind): ScriptTemplate[] {
  return kind === "powershell" ? POWERSHELL_TEMPLATES : BATCH_TEMPLATES;
}
