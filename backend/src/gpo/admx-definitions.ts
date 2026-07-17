/**
 * Pre-built ADMX category and policy definitions
 * This is a static representation of the ADMX files for reliable parsing
 */

export interface AdmxPolicyDef {
  name: string;
  class: "User" | "Machine" | "Both";
  displayName: string;
  explainText?: string;
  key: string;
  valueName: string;
  parentCategory: string;
  elements?: {
    id: string;
    type: "decimal" | "text" | "enum";
    valueName?: string;
    minValue?: number;
    maxValue?: number;
    items?: { displayName: string; value: number }[];
  }[];
}

export interface AdmxCategoryDef {
  name: string;
  displayName: string;
  parentCategory?: string;
}

// Windows.admx definitions
const windowsCategories: AdmxCategoryDef[] = [
  { name: "Windows", displayName: "Windows" },
  { name: "WindowsComponents", displayName: "Windows-Komponenten", parentCategory: "windows:Windows" },
  { name: "WindowsUpdate", displayName: "Windows Update", parentCategory: "windows:WindowsComponents" },
  { name: "System", displayName: "System", parentCategory: "windows:Windows" },
  { name: "Logon", displayName: "Anmeldung", parentCategory: "windows:System" },
  { name: "Network", displayName: "Netzwerk", parentCategory: "windows:Windows" },
  { name: "Firewall", displayName: "Windows-Firewall", parentCategory: "windows:Network" },
  { name: "RemoteAssistance", displayName: "Remoteunterstützung", parentCategory: "windows:WindowsComponents" },
  { name: "ErrorReporting", displayName: "Fehlerberichterstattung", parentCategory: "windows:WindowsComponents" },
];

const windowsPolicies: AdmxPolicyDef[] = [
  {
    name: "NoAutoUpdate", class: "Machine", displayName: "Automatische Updates konfigurieren",
    explainText: "Legt fest, ob automatische Updates aktiviert sind.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", valueName: "NoAutoUpdate",
    parentCategory: "windows:WindowsUpdate"
  },
  {
    name: "AUOptions", class: "Machine", displayName: "Konfigurieren von automatischen Updates",
    explainText: "Legt fest, wie automatische Updates konfiguriert werden.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", valueName: "AUOptions",
    parentCategory: "windows:WindowsUpdate",
    elements: [{
      id: "AUOptions", type: "enum", valueName: "AUOptions",
      items: [
        { displayName: "Vor Herunterladen benachrichtigen", value: 2 },
        { displayName: "Automatisch herunterladen und vor Installieren benachrichtigen", value: 3 },
        { displayName: "Automatisch herunterladen und installieren", value: 4 },
        { displayName: "Automatisch herunterladen, installieren und Neustart ermöglichen", value: 5 },
      ]
    }]
  },
  {
    name: "LegalNoticeCaption", class: "Machine", displayName: "Anmeldehinweis anzeigen",
    explainText: "Zeigt einen Hinweis vor der Anmeldung an.",
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", valueName: "legalnoticecaption",
    parentCategory: "windows:Logon",
    elements: [{ id: "LegalNoticeCaption", type: "text", valueName: "legalnoticecaption" }]
  },
  {
    name: "LegalNoticeText", class: "Machine", displayName: "Anmeldehinweistext",
    explainText: "Der Text, der im Anmeldehinweis angezeigt wird.",
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", valueName: "legalnoticetext",
    parentCategory: "windows:Logon",
    elements: [{ id: "LegalNoticeText", type: "text", valueName: "legalnoticetext" }]
  },
  {
    name: "DisableCAD", class: "Machine", displayName: "Strg+Alt+Entf-Anforderung deaktivieren",
    explainText: "Deaktiviert die Anforderung von Strg+Alt+Entf vor der Anmeldung.",
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", valueName: "DisableCAD",
    parentCategory: "windows:Logon"
  },
  {
    name: "DontDisplayLastUserName", class: "Machine", displayName: "Letzten Benutzernamen nicht anzeigen",
    explainText: "Zeigt den letzten angemeldeten Benutzernamen nicht an.",
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", valueName: "DontDisplayLastUserName",
    parentCategory: "windows:Logon"
  },
  {
    name: "ShutdownWithoutLogon", class: "Machine", displayName: "Herunterfahren ohne Anmeldung zulassen",
    explainText: "Ermöglicht das Herunterfahren ohne Anmeldung.",
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System", valueName: "ShutdownWithoutLogon",
    parentCategory: "windows:Logon"
  },
  {
    name: "EnableFirewall", class: "Machine", displayName: "Windows-Firewall aktivieren",
    explainText: "Aktiviert die Windows-Firewall für Domänenprofile.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile", valueName: "EnableFirewall",
    parentCategory: "windows:Firewall"
  },
  {
    name: "DisableNotifications", class: "User", displayName: "Benachrichtigungen deaktivieren",
    explainText: "Deaktiviert Toast-Benachrichtigungen.",
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications", valueName: "NoToastApplicationNotification",
    parentCategory: "windows:System"
  },
  {
    name: "DisableLockScreen", class: "Machine", displayName: "Sperrbildschirm deaktivieren",
    explainText: "Deaktiviert den Sperrbildschirm.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization", valueName: "NoLockScreen",
    parentCategory: "windows:System"
  },
  {
    name: "DisableCortana", class: "Machine", displayName: "Cortana deaktivieren",
    explainText: "Deaktiviert den digitalen Assistenten Cortana.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search", valueName: "AllowCortana",
    parentCategory: "windows:WindowsComponents"
  },
  {
    name: "DisableTelemetry", class: "Machine", displayName: "Telemetrie konfigurieren",
    explainText: "Legt das Telemetrie-Level fest (0=Sicher, 1=Notwendig, 2=Erweitert, 3=Vollständig).",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", valueName: "AllowTelemetry",
    parentCategory: "windows:WindowsComponents",
    elements: [{ id: "TelemetryLevel", type: "decimal", valueName: "AllowTelemetry", minValue: 0, maxValue: 3 }]
  },
  {
    name: "DisableLocation", class: "Machine", displayName: "Standortdienste deaktivieren",
    explainText: "Deaktiviert die Standortdienste.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors", valueName: "DisableLocation",
    parentCategory: "windows:WindowsComponents"
  },
  {
    name: "DisableCamera", class: "Machine", displayName: "Kamerazugriff deaktivieren",
    explainText: "Verwehrt Apps den Zugriff auf die Kamera.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy", valueName: "LetAppsAccessCamera",
    parentCategory: "windows:WindowsComponents"
  },
  {
    name: "DisableMicrophone", class: "Machine", displayName: "Mikrofonzugriff deaktivieren",
    explainText: "Verwehrt Apps den Zugriff auf das Mikrofon.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy", valueName: "LetAppsAccessMicrophone",
    parentCategory: "windows:WindowsComponents"
  },
  {
    name: "DisableRemoteAssistance", class: "Machine", displayName: "Remoteunterstützung deaktivieren",
    explainText: "Deaktiviert die Remoteunterstützung.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "fAllowToGetHelp",
    parentCategory: "windows:RemoteAssistance"
  },
  {
    name: "DisableErrorReporting", class: "Machine", displayName: "Fehlerberichterstattung deaktivieren",
    explainText: "Deaktiviert die automatische Fehlerberichterstattung.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting", valueName: "Disabled",
    parentCategory: "windows:ErrorReporting"
  },
];

// InternetExplorer.admx definitions
const ieCategories: AdmxCategoryDef[] = [
  { name: "InternetExplorer", displayName: "Internet Explorer", parentCategory: "windows:WindowsComponents" },
  { name: "InternetControlPanel", displayName: "Internetoptionen", parentCategory: "ie:InternetExplorer" },
  { name: "SecurityPage", displayName: "Sicherheit", parentCategory: "ie:InternetControlPanel" },
  { name: "GeneralPage", displayName: "Allgemein", parentCategory: "ie:InternetControlPanel" },
];

const iePolicies: AdmxPolicyDef[] = [
  {
    name: "DisableHomePageChange", class: "Both", displayName: "Startseite ändern deaktivieren",
    explainText: "Verhindert das Ändern der Startseite.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel", valueName: "HomePage",
    parentCategory: "ie:InternetControlPanel"
  },
  {
    name: "HomePage", class: "Both", displayName: "Startseite festlegen",
    explainText: "Legt die Standard-Startseite fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Main", valueName: "Start Page",
    parentCategory: "ie:InternetControlPanel",
    elements: [{ id: "HomePage", type: "text", valueName: "Start Page" }]
  },
  {
    name: "DisableSearchProviderChange", class: "Both", displayName: "Suchanbieter ändern deaktivieren",
    explainText: "Verhindert das Ändern des Suchanbieters.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel", valueName: "AutoSearch",
    parentCategory: "ie:InternetControlPanel"
  },
  {
    name: "DisableProxyChange", class: "Both", displayName: "Proxy ändern deaktivieren",
    explainText: "Verhindert das Ändern der Proxy-Einstellungen.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel", valueName: "Proxy",
    parentCategory: "ie:InternetControlPanel"
  },
  {
    name: "ProxyServer", class: "Both", displayName: "Proxyserver",
    explainText: "Legt den Proxyserver fest (z.B. proxy:8080).",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", valueName: "ProxyServer",
    parentCategory: "ie:InternetControlPanel",
    elements: [{ id: "ProxyServer", type: "text", valueName: "ProxyServer" }]
  },
  {
    name: "ProxyOverride", class: "Both", displayName: "Proxyausnahmen",
    explainText: "Legt Adressen fest, die den Proxy umgehen.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", valueName: "ProxyOverride",
    parentCategory: "ie:InternetControlPanel",
    elements: [{ id: "ProxyOverride", type: "text", valueName: "ProxyOverride" }]
  },
  {
    name: "DisableSecurityPage", class: "Both", displayName: "Sicherheitsseite deaktivieren",
    explainText: "Deaktiviert die Sicherheitsseite in den Internetoptionen.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel", valueName: "SecurityTab",
    parentCategory: "ie:InternetControlPanel"
  },
  {
    name: "DisableBrowsingHistory", class: "Both", displayName: "Verlauf beim Beenden löschen",
    explainText: "Löscht den Browserverlauf beim Beenden.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Privacy", valueName: "ClearBrowsingHistoryOnExit",
    parentCategory: "ie:GeneralPage"
  },
  {
    name: "DeleteBrowsingHistory", class: "Both", displayName: "Verlauf löschen deaktivieren",
    explainText: "Deaktiviert die Option zum Löschen des Browserverlaufs.",
    key: "SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Privacy", valueName: "DisableDeleteBrowsingHistory",
    parentCategory: "ie:GeneralPage"
  },
];

// MicrosoftEdge.admx definitions
const edgeCategories: AdmxCategoryDef[] = [
  { name: "MicrosoftEdge", displayName: "Microsoft Edge", parentCategory: "windows:WindowsComponents" },
  { name: "StartupHomepage", displayName: "Startseite", parentCategory: "edge:MicrosoftEdge" },
  { name: "SearchEngine", displayName: "Suchmaschine", parentCategory: "edge:MicrosoftEdge" },
  { name: "Security", displayName: "Sicherheit", parentCategory: "edge:MicrosoftEdge" },
  { name: "Extensions", displayName: "Erweiterungen", parentCategory: "edge:MicrosoftEdge" },
];

const edgePolicies: AdmxPolicyDef[] = [
  {
    name: "HomepageLocation", class: "Both", displayName: "Startseite festlegen",
    explainText: "Legt die Startseite für Edge fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "HomepageLocation",
    parentCategory: "edge:StartupHomepage",
    elements: [{ id: "HomepageLocation", type: "text", valueName: "HomepageLocation" }]
  },
  {
    name: "RestoreOnStartup", class: "Both", displayName: "Startverhalten",
    explainText: "Legt fest, was beim Start von Edge angezeigt wird.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "RestoreOnStartup",
    parentCategory: "edge:StartupHomepage",
    elements: [{
      id: "RestoreOnStartup", type: "enum", valueName: "RestoreOnStartup",
      items: [
        { displayName: "Startseite anzeigen", value: 1 },
        { displayName: "Zuletzt geöffnete Seiten wiederherstellen", value: 4 },
        { displayName: "Bestimmte Seiten festlegen", value: 5 },
      ]
    }]
  },
  {
    name: "HomepageIsNewTabPage", class: "Both", displayName: "Neuer Tab als Startseite",
    explainText: "Verwendet die neue Tab-Seite als Startseite.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "HomepageIsNewTabPage",
    parentCategory: "edge:StartupHomepage"
  },
  {
    name: "DefaultSearchProviderEnabled", class: "Both", displayName: "Standard-Suchmaschine aktivieren",
    explainText: "Aktiviert die Standard-Suchmaschine.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "DefaultSearchProviderEnabled",
    parentCategory: "edge:SearchEngine"
  },
  {
    name: "DefaultSearchProviderName", class: "Both", displayName: "Name der Suchmaschine",
    explainText: "Legt den Namen der Standard-Suchmaschine fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "DefaultSearchProviderName",
    parentCategory: "edge:SearchEngine",
    elements: [{ id: "DefaultSearchProviderName", type: "text", valueName: "DefaultSearchProviderName" }]
  },
  {
    name: "SmartScreenEnabled", class: "Both", displayName: "SmartScreen aktivieren",
    explainText: "Aktiviert den Microsoft SmartScreen-Filter.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "SmartScreenEnabled",
    parentCategory: "edge:Security"
  },
  {
    name: "PasswordManagerEnabled", class: "Both", displayName: "Passwort-Manager",
    explainText: "Aktiviert den integrierten Passwort-Manager.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "PasswordManagerEnabled",
    parentCategory: "edge:Security"
  },
  {
    name: "AutofillAddressEnabled", class: "Both", displayName: "Adressen-Autovervollständigung",
    explainText: "Aktiviert die Autovervollständigung für Adressen.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "AutofillAddressEnabled",
    parentCategory: "edge:Security"
  },
  {
    name: "AutofillCreditCardEnabled", class: "Both", displayName: "Kreditkarten-Autovervollständigung",
    explainText: "Aktiviert die Autovervollständigung für Kreditkarten.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "AutofillCreditCardEnabled",
    parentCategory: "edge:Security"
  },
  {
    name: "BrowserSignin", class: "Both", displayName: "Browser-Anmeldung",
    explainText: "Legt fest, ob Benutzer sich bei Edge anmelden können.",
    key: "SOFTWARE\\Policies\\Microsoft\\Edge", valueName: "BrowserSignin",
    parentCategory: "edge:MicrosoftEdge",
    elements: [{
      id: "BrowserSignin", type: "enum", valueName: "BrowserSignin",
      items: [
        { displayName: "Anmeldung deaktivieren", value: 0 },
        { displayName: "Anmeldung zulassen", value: 1 },
        { displayName: "Anmeldung erzwingen", value: 2 },
      ]
    }]
  },
];

// RemoteDesktopServices.admx definitions
const rdpCategories: AdmxCategoryDef[] = [
  { name: "RemoteDesktopServices", displayName: "Remotedesktopdienste", parentCategory: "windows:WindowsComponents" },
  { name: "RDSessionHost", displayName: "RD-Sitzungshost", parentCategory: "rdp:RemoteDesktopServices" },
  { name: "Connections", displayName: "Verbindungen", parentCategory: "rdp:RDSessionHost" },
  { name: "SessionTimeLimits", displayName: "Sitzungszeitlimits", parentCategory: "rdp:RDSessionHost" },
  { name: "DeviceRedirection", displayName: "Geräteumleitung", parentCategory: "rdp:RDSessionHost" },
  { name: "Security", displayName: "Sicherheit", parentCategory: "rdp:RDSessionHost" },
];

const rdpPolicies: AdmxPolicyDef[] = [
  {
    name: "fDenyTSConnections", class: "Machine", displayName: "Verbindungen nicht zulassen",
    explainText: "Verhindert eingehende Remotedesktopverbindungen.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "fDenyTSConnections",
    parentCategory: "rdp:Connections"
  },
  {
    name: "MaxInstanceCount", class: "Machine", displayName: "Maximale Verbindungen",
    explainText: "Legt die maximale Anzahl gleichzeitiger Verbindungen fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "MaxInstanceCount",
    parentCategory: "rdp:Connections",
    elements: [{ id: "MaxInstanceCount", type: "decimal", valueName: "MaxInstanceCount", minValue: 1, maxValue: 999999 }]
  },
  {
    name: "fSingleSessionPerUser", class: "Machine", displayName: "Eine Sitzung pro Benutzer",
    explainText: "Beschränkt Benutzer auf eine aktive Sitzung.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "fSingleSessionPerUser",
    parentCategory: "rdp:Connections"
  },
  {
    name: "MaxConnectionTime", class: "Machine", displayName: "Maximale Verbindungsdauer (Min)",
    explainText: "Legt die maximale Verbindungsdauer in Minuten fest (0=unbegrenzt).",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "MaxConnectionTime",
    parentCategory: "rdp:SessionTimeLimits",
    elements: [{ id: "MaxConnectionTime", type: "decimal", valueName: "MaxConnectionTime", minValue: 0, maxValue: 720 }]
  },
  {
    name: "MaxIdleTime", class: "Machine", displayName: "Maximale Leerlaufzeit (Min)",
    explainText: "Legt die maximale Leerlaufzeit in Minuten fest (0=unbegrenzt).",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "MaxIdleTime",
    parentCategory: "rdp:SessionTimeLimits",
    elements: [{ id: "MaxIdleTime", type: "decimal", valueName: "MaxIdleTime", minValue: 0, maxValue: 720 }]
  },
  {
    name: "fDisableCdm", class: "Machine", displayName: "Laufwerkumleitung deaktivieren",
    explainText: "Deaktiviert die Umleitung von Laufwerken.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "fDisableCdm",
    parentCategory: "rdp:DeviceRedirection"
  },
  {
    name: "fDisableClip", class: "Machine", displayName: "Zwischenablage deaktivieren",
    explainText: "Deaktiviert die Zwischenablageumleitung.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "fDisableClip",
    parentCategory: "rdp:DeviceRedirection"
  },
  {
    name: "SecurityLayer", class: "Machine", displayName: "Sicherheitsebene",
    explainText: "Legt die Sicherheitsebene für Verbindungen fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "SecurityLayer",
    parentCategory: "rdp:Security",
    elements: [{
      id: "SecurityLayer", type: "enum", valueName: "SecurityLayer",
      items: [
        { displayName: "RDP-Sicherheit", value: 0 },
        { displayName: "SSL (TLS 1.0)", value: 1 },
        { displayName: "NLA (Network Level Authentication)", value: 2 },
      ]
    }]
  },
  {
    name: "UserAuthentication", class: "Machine", displayName: "NLA-Authentifizierung",
    explainText: "Erfordert Netzwerk-Level-Authentifizierung.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "UserAuthentication",
    parentCategory: "rdp:Security"
  },
  {
    name: "MinEncryptionLevel", class: "Machine", displayName: "Minimale Verschlüsselungsstufe",
    explainText: "Legt die minimale Verschlüsselungsstufe fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services", valueName: "MinEncryptionLevel",
    parentCategory: "rdp:Security",
    elements: [{
      id: "MinEncryptionLevel", type: "enum", valueName: "MinEncryptionLevel",
      items: [
        { displayName: "Niedrig", value: 1 },
        { displayName: "Clientkompatibel", value: 2 },
        { displayName: "Hoch", value: 3 },
        { displayName: "FIPS-kompatibel", value: 4 },
      ]
    }]
  },
];

// WindowsFirewall.admx definitions
const firewallCategories: AdmxCategoryDef[] = [
  { name: "WindowsFirewall", displayName: "Windows-Firewall", parentCategory: "windows:Network" },
  { name: "DomainProfile", displayName: "Domänenprofil", parentCategory: "firewall:WindowsFirewall" },
  { name: "StandardProfile", displayName: "Standardprofil", parentCategory: "firewall:WindowsFirewall" },
  { name: "PublicProfile", displayName: "Öffentliches Profil", parentCategory: "firewall:WindowsFirewall" },
];

const firewallPolicies: AdmxPolicyDef[] = [
  {
    name: "EnableFirewallDomain", class: "Machine", displayName: "Firewall aktivieren (Domäne)",
    explainText: "Aktiviert die Windows-Firewall für das Domänenprofil.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile", valueName: "EnableFirewall",
    parentCategory: "firewall:DomainProfile"
  },
  {
    name: "EnableFirewallStandard", class: "Machine", displayName: "Firewall aktivieren (Standard)",
    explainText: "Aktiviert die Windows-Firewall für das Standardprofil.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\StandardProfile", valueName: "EnableFirewall",
    parentCategory: "firewall:StandardProfile"
  },
  {
    name: "EnableFirewallPublic", class: "Machine", displayName: "Firewall aktivieren (Öffentlich)",
    explainText: "Aktiviert die Windows-Firewall für das öffentliche Profil.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\PublicProfile", valueName: "EnableFirewall",
    parentCategory: "firewall:PublicProfile"
  },
  {
    name: "DefaultInboundActionDomain", class: "Machine", displayName: "Standardaktion eingehend (Domäne)",
    explainText: "Legt die Standardaktion für eingehenden Datenverkehr fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile", valueName: "DefaultInboundAction",
    parentCategory: "firewall:DomainProfile",
    elements: [{
      id: "DefaultInboundAction", type: "enum", valueName: "DefaultInboundAction",
      items: [
        { displayName: "Blockieren", value: 1 },
        { displayName: "Zulassen", value: 0 },
      ]
    }]
  },
  {
    name: "DefaultOutboundActionDomain", class: "Machine", displayName: "Standardaktion ausgehend (Domäne)",
    explainText: "Legt die Standardaktion für ausgehenden Datenverkehr fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile", valueName: "DefaultOutboundAction",
    parentCategory: "firewall:DomainProfile",
    elements: [{
      id: "DefaultOutboundAction", type: "enum", valueName: "DefaultOutboundAction",
      items: [
        { displayName: "Blockieren", value: 1 },
        { displayName: "Zulassen", value: 0 },
      ]
    }]
  },
  {
    name: "DisableNotificationsDomain", class: "Machine", displayName: "Benachrichtigungen deaktivieren (Domäne)",
    explainText: "Deaktiviert Firewall-Benachrichtigungen.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile", valueName: "DisableNotifications",
    parentCategory: "firewall:DomainProfile"
  },
  {
    name: "LoggingEnabledDomain", class: "Machine", displayName: "Protokollierung aktivieren (Domäne)",
    explainText: "Aktiviert die Protokollierung erfolgreicher Verbindungen.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile\\Logging", valueName: "LogSuccessfulConnections",
    parentCategory: "firewall:DomainProfile"
  },
  {
    name: "LogFilePathDomain", class: "Machine", displayName: "Protokolldateipfad (Domäne)",
    explainText: "Legt den Pfad für die Firewall-Protokolldatei fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile\\Logging", valueName: "LogFilePath",
    parentCategory: "firewall:DomainProfile",
    elements: [{ id: "LogFilePath", type: "text", valueName: "LogFilePath" }]
  },
  {
    name: "LogFileSizeDomain", class: "Machine", displayName: "Protokolldateigröße (Domäne)",
    explainText: "Legt die maximale Größe der Protokolldatei in KB fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile\\Logging", valueName: "LogFileSize",
    parentCategory: "firewall:DomainProfile",
    elements: [{ id: "LogFileSize", type: "decimal", valueName: "LogFileSize", minValue: 1, maxValue: 32767 }]
  },
];

// GroupPolicy.admx definitions
const gpCategories: AdmxCategoryDef[] = [
  { name: "GroupPolicy", displayName: "Gruppenrichtlinie", parentCategory: "windows:System" },
  { name: "RegistryPolicyProcessing", displayName: "Registrierungsrichtlinienverarbeitung", parentCategory: "gp:GroupPolicy" },
];

const gpPolicies: AdmxPolicyDef[] = [
  {
    name: "NoBackgroundPolicy", class: "Machine", displayName: "Hintergrundverarbeitung",
    explainText: "Legt fest, ob Richtlinien im Hintergrund verarbeitet werden.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Group Policy\\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}", valueName: "NoBackgroundPolicy",
    parentCategory: "gp:RegistryPolicyProcessing"
  },
  {
    name: "NoGPOListChanges", class: "Machine", displayName: "GPO-Änderungen ignorieren",
    explainText: "Ignoriert Änderungen an der GPO-Liste.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Group Policy\\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}", valueName: "NoGPOListChanges",
    parentCategory: "gp:RegistryPolicyProcessing"
  },
  {
    name: "MaxGPOProcessingTime", class: "Machine", displayName: "Max. Verarbeitungszeit",
    explainText: "Maximale Zeit für GPO-Verarbeitung in Sekunden.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\Group Policy\\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}", valueName: "MaxGPOProcessingTime",
    parentCategory: "gp:RegistryPolicyProcessing",
    elements: [{ id: "MaxGPOProcessingTime", type: "decimal", valueName: "MaxGPOProcessingTime", minValue: 0, maxValue: 99999 }]
  },
];

// WindowsRemoteManagement.admx definitions
const winrmCategories: AdmxCategoryDef[] = [
  { name: "WindowsRemoteManagement", displayName: "Windows-Remoteverwaltung", parentCategory: "windows:WindowsComponents" },
  { name: "WinRMService", displayName: "WinRM-Dienst", parentCategory: "winrm:WindowsRemoteManagement" },
  { name: "WinRMClient", displayName: "WinRM-Client", parentCategory: "winrm:WindowsRemoteManagement" },
];

const winrmPolicies: AdmxPolicyDef[] = [
  {
    name: "AllowAutoConfig", class: "Both", displayName: "Remoteserververwaltung zulassen",
    explainText: "Ermöglicht die Fernverwaltung über WinRM.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Service", valueName: "AllowAutoConfig",
    parentCategory: "winrm:WinRMService",
    elements: [
      { id: "IPv4Filter", type: "text", valueName: "IPv4Filter" },
      { id: "IPv6Filter", type: "text", valueName: "IPv6Filter" },
    ]
  },
  {
    name: "AllowBasic", class: "Both", displayName: "Basic-Authentifizierung zulassen",
    explainText: "Erlaubt die Basic-Authentifizierung.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Service", valueName: "AllowBasic",
    parentCategory: "winrm:WinRMService"
  },
  {
    name: "AllowUnencryptedTraffic", class: "Both", displayName: "Unverschlüsselten Datenverkehr zulassen",
    explainText: "Erlaubt unverschlüsselten WinRM-Datenverkehr.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Service", valueName: "AllowUnencryptedTraffic",
    parentCategory: "winrm:WinRMService"
  },
  {
    name: "AllowRemoteShellAccess", class: "Machine", displayName: "Remote-Shell-Zugriff zulassen",
    explainText: "Erlaubt den Zugriff auf die Remote-Shell.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Service\\WinRS", valueName: "AllowRemoteShellAccess",
    parentCategory: "winrm:WinRMService"
  },
  {
    name: "ClientAllowBasic", class: "Both", displayName: "Basic-Authentifizierung (Client)",
    explainText: "Erlaubt Basic-Authentifizierung für den Client.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Client", valueName: "AllowBasic",
    parentCategory: "winrm:WinRMClient"
  },
  {
    name: "TrustedHosts", class: "Both", displayName: "Vertrauenswürdige Hosts",
    explainText: "Liste der vertrauenswürdigen Hosts.",
    key: "SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Client", valueName: "TrustedHosts",
    parentCategory: "winrm:WinRMClient",
    elements: [{ id: "TrustedHosts", type: "text", valueName: "TrustedHosts" }]
  },
];

// PowerManagement.admx definitions
const powerCategories: AdmxCategoryDef[] = [
  { name: "PowerManagement", displayName: "Energieverwaltung", parentCategory: "windows:System" },
  { name: "SleepSettings", displayName: "Energiesparmodus", parentCategory: "power:PowerManagement" },
  { name: "ButtonSettings", displayName: "Tasteneinstellungen", parentCategory: "power:PowerManagement" },
];

const powerPolicies: AdmxPolicyDef[] = [
  {
    name: "SleepDisabled", class: "Machine", displayName: "Standby deaktivieren",
    explainText: "Deaktiviert den Standby-Modus.",
    key: "SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\abfc2519-3608-4c2a-94ea-171b0ed546ab", valueName: "ACSettingIndex",
    parentCategory: "power:SleepSettings"
  },
  {
    name: "HibernateDisabled", class: "Machine", displayName: "Ruhezustand deaktivieren",
    explainText: "Deaktiviert den Ruhezustand.",
    key: "SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\94ac6d29-73ce-41a6-809f-6363ba21b47e", valueName: "ACSettingIndex",
    parentCategory: "power:SleepSettings"
  },
  {
    name: "PowerButtonAction", class: "Machine", displayName: "Aktion Netzschalter",
    explainText: "Legt die Aktion beim Drücken des Netzschalters fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\7648EFA3-DD9C-4E3E-B566-10F9E5B3B1E3", valueName: "ACSettingIndex",
    parentCategory: "power:ButtonSettings",
    elements: [{
      id: "PowerButtonAction", type: "enum", valueName: "ACSettingIndex",
      items: [
        { displayName: "Nichts unternehmen", value: 0 },
        { displayName: "Standby", value: 1 },
        { displayName: "Ruhezustand", value: 2 },
        { displayName: "Herunterfahren", value: 3 },
      ]
    }]
  },
  {
    name: "SleepButtonAction", class: "Machine", displayName: "Aktion Standby-Taste",
    explainText: "Legt die Aktion beim Drücken der Standby-Taste fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\96996BC0-5B56-4373-B2B4-A7B2B0F1D0D9", valueName: "ACSettingIndex",
    parentCategory: "power:ButtonSettings",
    elements: [{
      id: "SleepButtonAction", type: "enum", valueName: "ACSettingIndex",
      items: [
        { displayName: "Nichts unternehmen", value: 0 },
        { displayName: "Standby", value: 1 },
        { displayName: "Ruhezustand", value: 2 },
        { displayName: "Herunterfahren", value: 3 },
      ]
    }]
  },
  {
    name: "LidCloseAction", class: "Machine", displayName: "Aktion bei Deckelschluss",
    explainText: "Legt die Aktion beim Schließen des Laptopdeckels fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\5CA83367-6E45-459F-A27B-476B1D01C936", valueName: "ACSettingIndex",
    parentCategory: "power:ButtonSettings",
    elements: [{
      id: "LidCloseAction", type: "enum", valueName: "ACSettingIndex",
      items: [
        { displayName: "Nichts unternehmen", value: 0 },
        { displayName: "Standby", value: 1 },
        { displayName: "Ruhezustand", value: 2 },
        { displayName: "Herunterfahren", value: 3 },
      ]
    }]
  },
];

// WindowsTimeService.admx definitions
const w32timeCategories: AdmxCategoryDef[] = [
  { name: "WindowsTimeService", displayName: "Windows-Zeitdienst", parentCategory: "windows:System" },
  { name: "TimeProviders", displayName: "Zeitanbieter", parentCategory: "w32time:WindowsTimeService" },
];

const w32timePolicies: AdmxPolicyDef[] = [
  {
    name: "W32Time_NtpClient", class: "Machine", displayName: "NTP-Client aktivieren",
    explainText: "Aktiviert den NTP-Client.",
    key: "SOFTWARE\\Policies\\Microsoft\\W32Time\\TimeProviders\\NtpClient", valueName: "Enabled",
    parentCategory: "w32time:TimeProviders"
  },
  {
    name: "W32Time_NtpServer", class: "Machine", displayName: "NTP-Server konfigurieren",
    explainText: "Legt den NTP-Server fest.",
    key: "SOFTWARE\\Policies\\Microsoft\\W32Time\\Parameters", valueName: "NtpServer",
    parentCategory: "w32time:TimeProviders",
    elements: [{ id: "NtpServer", type: "text", valueName: "NtpServer" }]
  },
];

// Combine all definitions
export const ALL_ADMX_CATEGORIES: AdmxCategoryDef[] = [
  ...windowsCategories,
  ...ieCategories,
  ...edgeCategories,
  ...rdpCategories,
  ...firewallCategories,
  ...gpCategories,
  ...winrmCategories,
  ...powerCategories,
  ...w32timeCategories,
];

export const ALL_ADMX_POLICIES: AdmxPolicyDef[] = [
  ...windowsPolicies,
  ...iePolicies,
  ...edgePolicies,
  ...rdpPolicies,
  ...firewallPolicies,
  ...gpPolicies,
  ...winrmPolicies,
  ...powerPolicies,
  ...w32timePolicies,
];
