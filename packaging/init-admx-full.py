#!/usr/bin/env python3
"""
Comprehensive ADMX PolicyDefinitions initialization for Samba AD
Includes: Windows, Firewall, Group Policy, WinRM, Internet Explorer, Edge, 
Remote Desktop, Power Management, Time Service, and more
"""

import os
import sys
import subprocess

DOMAIN = sys.argv[1] if len(sys.argv) > 1 else "bsw.local"
SYSVOL_BASE = "/var/lib/samba/sysvol"
POLICY_DEFS = os.path.join(SYSVOL_BASE, DOMAIN, "PolicyDefinitions")

os.makedirs(os.path.join(POLICY_DEFS, "en-US"), exist_ok=True)

def write_file(filename, content):
    filepath = os.path.join(POLICY_DEFS, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: {filename}")

def write_adml(filename, content):
    filepath = os.path.join(POLICY_DEFS, "en-US", filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Created: en-US/{filename}")

print(f"Creating ADMX PolicyDefinitions for domain: {DOMAIN}")

# Windows.admx
write_file("windows.admx", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <policyNamespaces><target prefix="windows" namespace="Microsoft.Policies.Windows" /></policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="Windows" displayName="$(string.Windows)" />
    <category name="WindowsComponents" displayName="$(string.WindowsComponents)"><parentCategory ref="windows:Windows" /></category>
    <category name="WindowsUpdate" displayName="$(string.WindowsUpdate)"><parentCategory ref="windows:WindowsComponents" /></category>
    <category name="System" displayName="$(string.System)"><parentCategory ref="windows:Windows" /></category>
    <category name="Logon" displayName="$(string.Logon)"><parentCategory ref="windows:System" /></category>
    <category name="Network" displayName="$(string.Network)"><parentCategory ref="windows:Windows" /></category>
    <category name="Firewall" displayName="$(string.Firewall)"><parentCategory ref="windows:Network" /></category>
    <category name="RemoteAssistance" displayName="$(string.RemoteAssistance)"><parentCategory ref="windows:WindowsComponents" /></category>
    <category name="ErrorReporting" displayName="$(string.ErrorReporting)"><parentCategory ref="windows:WindowsComponents" /></category>
  </categories>
  <policies>
    <policy name="NoAutoUpdate" class="Machine" displayName="$(string.NoAutoUpdate)" explainText="$(string.NoAutoUpdate_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU" valueName="NoAutoUpdate">
      <parentCategory ref="windows:WindowsUpdate" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="0" /></enabledValue><disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="AUOptions" class="Machine" displayName="$(string.AUOptions)" explainText="$(string.AUOptions_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU" valueName="AUOptions">
      <parentCategory ref="windows:WindowsUpdate" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <elements><enum id="AUOptions" valueName="AUOptions">
        <item displayName="$(string.AUOptions_2)"><value><decimal value="2" /></value></item>
        <item displayName="$(string.AUOptions_3)"><value><decimal value="3" /></value></item>
        <item displayName="$(string.AUOptions_4)"><value><decimal value="4" /></value></item>
        <item displayName="$(string.AUOptions_5)"><value><decimal value="5" /></value></item>
      </enum></elements>
    </policy>
    <policy name="LegalNoticeCaption" class="Machine" displayName="$(string.LegalNoticeCaption)" explainText="$(string.LegalNoticeCaption_Help)" key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" valueName="legalnoticecaption">
      <parentCategory ref="windows:Logon" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <elements><text id="LegalNoticeCaption" valueName="legalnoticecaption" /></elements>
    </policy>
    <policy name="LegalNoticeText" class="Machine" displayName="$(string.LegalNoticeText)" explainText="$(string.LegalNoticeText_Help)" key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" valueName="legalnoticetext">
      <parentCategory ref="windows:Logon" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <elements><text id="LegalNoticeText" valueName="legalnoticetext" /></elements>
    </policy>
    <policy name="DisableCAD" class="Machine" displayName="$(string.DisableCAD)" explainText="$(string.DisableCAD_Help)" key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" valueName="DisableCAD">
      <parentCategory ref="windows:Logon" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DontDisplayLastUserName" class="Machine" displayName="$(string.DontDisplayLastUserName)" explainText="$(string.DontDisplayLastUserName_Help)" key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" valueName="DontDisplayLastUserName">
      <parentCategory ref="windows:Logon" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="ShutdownWithoutLogon" class="Machine" displayName="$(string.ShutdownWithoutLogon)" explainText="$(string.ShutdownWithoutLogon_Help)" key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" valueName="ShutdownWithoutLogon">
      <parentCategory ref="windows:Logon" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="EnableFirewall" class="Machine" displayName="$(string.EnableFirewall)" explainText="$(string.EnableFirewall_Help)" key="SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile" valueName="EnableFirewall">
      <parentCategory ref="windows:Firewall" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableNotifications" class="User" displayName="$(string.DisableNotifications)" explainText="$(string.DisableNotifications_Help)" key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" valueName="NoToastApplicationNotification">
      <parentCategory ref="windows:System" /><supportedOn ref="windows:SUPPORTED_Windows8" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableLockScreen" class="Machine" displayName="$(string.DisableLockScreen)" explainText="$(string.DisableLockScreen_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization" valueName="NoLockScreen">
      <parentCategory ref="windows:System" /><supportedOn ref="windows:SUPPORTED_Windows8" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableCortana" class="Machine" displayName="$(string.DisableCortana)" explainText="$(string.DisableCortana_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search" valueName="AllowCortana">
      <parentCategory ref="windows:WindowsComponents" /><supportedOn ref="windows:SUPPORTED_Windows10" />
      <enabledValue><decimal value="0" /></enabledValue><disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="DisableTelemetry" class="Machine" displayName="$(string.DisableTelemetry)" explainText="$(string.DisableTelemetry_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" valueName="AllowTelemetry">
      <parentCategory ref="windows:WindowsComponents" /><supportedOn ref="windows:SUPPORTED_Windows10" />
      <elements><decimal id="TelemetryLevel" valueName="AllowTelemetry" minValue="0" maxValue="3" /></elements>
    </policy>
    <policy name="DisableLocation" class="Machine" displayName="$(string.DisableLocation)" explainText="$(string.DisableLocation_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors" valueName="DisableLocation">
      <parentCategory ref="windows:WindowsComponents" /><supportedOn ref="windows:SUPPORTED_Windows7" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableCamera" class="Machine" displayName="$(string.DisableCamera)" explainText="$(string.DisableCamera_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" valueName="LetAppsAccessCamera">
      <parentCategory ref="windows:WindowsComponents" /><supportedOn ref="windows:SUPPORTED_Windows10" />
      <enabledValue><decimal value="2" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableMicrophone" class="Machine" displayName="$(string.DisableMicrophone)" explainText="$(string.DisableMicrophone_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy" valueName="LetAppsAccessMicrophone">
      <parentCategory ref="windows:WindowsComponents" /><supportedOn ref="windows:SUPPORTED_Windows10" />
      <enabledValue><decimal value="2" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableRemoteAssistance" class="Machine" displayName="$(string.DisableRemoteAssistance)" explainText="$(string.DisableRemoteAssistance_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="fAllowToGetHelp">
      <parentCategory ref="windows:RemoteAssistance" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="0" /></enabledValue><disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="DisableErrorReporting" class="Machine" displayName="$(string.DisableErrorReporting)" explainText="$(string.DisableErrorReporting_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting" valueName="Disabled">
      <parentCategory ref="windows:ErrorReporting" /><supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="$(string.SUPPORTED_WindowsXP)" />
      <definition name="SUPPORTED_Windows7" displayName="$(string.SUPPORTED_Windows7)" />
      <definition name="SUPPORTED_Windows8" displayName="$(string.SUPPORTED_Windows8)" />
      <definition name="SUPPORTED_Windows10" displayName="$(string.SUPPORTED_Windows10)" />
    </definitions>
  </supportedOn>
</policyDefinitions>''')

write_adml("windows.adml", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <displayName>Windows Administrative Templates</displayName>
  <description>Administrative Vorlagen für Windows-Einstellungen</description>
  <resources>
    <stringTable>
      <string id="Windows">Windows</string>
      <string id="WindowsComponents">Windows-Komponenten</string>
      <string id="WindowsUpdate">Windows Update</string>
      <string id="System">System</string>
      <string id="Logon">Anmeldung</string>
      <string id="Network">Netzwerk</string>
      <string id="Firewall">Windows-Firewall</string>
      <string id="RemoteAssistance">Remoteunterstützung</string>
      <string id="ErrorReporting">Fehlerberichterstattung</string>
      <string id="NoAutoUpdate">Automatische Updates konfigurieren</string>
      <string id="NoAutoUpdate_Help">Legt fest, ob automatische Updates aktiviert sind.</string>
      <string id="AUOptions">Konfigurieren von automatischen Updates</string>
      <string id="AUOptions_Help">Legt fest, wie automatische Updates konfiguriert werden.</string>
      <string id="AUOptions_2">Vor Herunterladen benachrichtigen</string>
      <string id="AUOptions_3">Automatisch herunterladen und vor Installieren benachrichtigen</string>
      <string id="AUOptions_4">Automatisch herunterladen und installieren</string>
      <string id="AUOptions_5">Automatisch herunterladen, installieren und Neustart ermöglichen</string>
      <string id="LegalNoticeCaption">Anmeldehinweis anzeigen</string>
      <string id="LegalNoticeCaption_Help">Zeigt einen Hinweis vor der Anmeldung an.</string>
      <string id="LegalNoticeText">Anmeldehinweistext</string>
      <string id="LegalNoticeText_Help">Der Text, der im Anmeldehinweis angezeigt wird.</string>
      <string id="DisableCAD">Strg+Alt+Entf-Anforderung deaktivieren</string>
      <string id="DisableCAD_Help">Deaktiviert die Anforderung von Strg+Alt+Entf vor der Anmeldung.</string>
      <string id="DontDisplayLastUserName">Letzten Benutzernamen nicht anzeigen</string>
      <string id="DontDisplayLastUserName_Help">Zeigt den letzten angemeldeten Benutzernamen nicht an.</string>
      <string id="ShutdownWithoutLogon">Herunterfahren ohne Anmeldung zulassen</string>
      <string id="ShutdownWithoutLogon_Help">Ermöglicht das Herunterfahren ohne Anmeldung.</string>
      <string id="EnableFirewall">Windows-Firewall aktivieren</string>
      <string id="EnableFirewall_Help">Aktiviert die Windows-Firewall für Domänenprofile.</string>
      <string id="DisableNotifications">Benachrichtigungen deaktivieren</string>
      <string id="DisableNotifications_Help">Deaktiviert Toast-Benachrichtigungen.</string>
      <string id="DisableLockScreen">Sperrbildschirm deaktivieren</string>
      <string id="DisableLockScreen_Help">Deaktiviert den Sperrbildschirm.</string>
      <string id="DisableCortana">Cortana deaktivieren</string>
      <string id="DisableCortana_Help">Deaktiviert den digitalen Assistenten Cortana.</string>
      <string id="DisableTelemetry">Telemetrie konfigurieren</string>
      <string id="DisableTelemetry_Help">Legt das Telemetrie-Level fest (0=Sicher, 1=Notwendig, 2=Erweitert, 3=Vollständig).</string>
      <string id="DisableLocation">Standortdienste deaktivieren</string>
      <string id="DisableLocation_Help">Deaktiviert die Standortdienste.</string>
      <string id="DisableCamera">Kamerazugriff deaktivieren</string>
      <string id="DisableCamera_Help">Verwehrt Apps den Zugriff auf die Kamera.</string>
      <string id="DisableMicrophone">Mikrofonzugriff deaktivieren</string>
      <string id="DisableMicrophone_Help">Verwehrt Apps den Zugriff auf das Mikrofon.</string>
      <string id="DisableRemoteAssistance">Remoteunterstützung deaktivieren</string>
      <string id="DisableRemoteAssistance_Help">Deaktiviert die Remoteunterstützung.</string>
      <string id="DisableErrorReporting">Fehlerberichterstattung deaktivieren</string>
      <string id="DisableErrorReporting_Help">Deaktiviert die automatische Fehlerberichterstattung.</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
      <string id="SUPPORTED_Windows7">Mindestens Windows 7</string>
      <string id="SUPPORTED_Windows8">Mindestens Windows 8</string>
      <string id="SUPPORTED_Windows10">Mindestens Windows 10</string>
    </stringTable>
    <presentationTable>
      <presentation id="AUOptions"><dropdownList refId="AUOptions" defaultItem="4" /></presentation>
      <presentation id="LegalNoticeCaption"><textBox refId="LegalNoticeCaption"><label>Titel:</label></textBox></presentation>
      <presentation id="LegalNoticeText"><textBox refId="LegalNoticeText"><label>Text:</label></textBox></presentation>
      <presentation id="DisableTelemetry"><decimalTextBox refId="TelemetryLevel" defaultValue="0" label="Level (0-3):" /></presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>''')

# InternetExplorer.admx
write_file("InternetExplorer.admx", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <policyNamespaces><target prefix="IE" namespace="Microsoft.Policies.InternetExplorer" /></policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="InternetExplorer" displayName="$(string.InternetExplorer)"><parentCategory ref="IE:WindowsComponents" /></category>
    <category name="InternetControlPanel" displayName="$(string.InternetControlPanel)"><parentCategory ref="IE:InternetExplorer" /></category>
    <category name="SecurityPage" displayName="$(string.SecurityPage)"><parentCategory ref="IE:InternetControlPanel" /></category>
    <category name="GeneralPage" displayName="$(string.GeneralPage)"><parentCategory ref="IE:InternetControlPanel" /></category>
  </categories>
  <policies>
    <policy name="DisableHomePageChange" class="Both" displayName="$(string.DisableHomePageChange)" explainText="$(string.DisableHomePageChange_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel" valueName="HomePage">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="HomePage" class="Both" displayName="$(string.HomePage)" explainText="$(string.HomePage_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Main" valueName="Start Page">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <elements><text id="HomePage" valueName="Start Page" /></elements>
    </policy>
    <policy name="DisableSearchProviderChange" class="Both" displayName="$(string.DisableSearchProviderChange)" explainText="$(string.DisableSearchProviderChange_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel" valueName="AutoSearch">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableProxyChange" class="Both" displayName="$(string.DisableProxyChange)" explainText="$(string.DisableProxyChange_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel" valueName="Proxy">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="ProxyServer" class="Both" displayName="$(string.ProxyServer)" explainText="$(string.ProxyServer_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" valueName="ProxyServer">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <elements><text id="ProxyServer" valueName="ProxyServer" /></elements>
    </policy>
    <policy name="ProxyOverride" class="Both" displayName="$(string.ProxyOverride)" explainText="$(string.ProxyOverride_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" valueName="ProxyOverride">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <elements><text id="ProxyOverride" valueName="ProxyOverride" /></elements>
    </policy>
    <policy name="DisableSecurityPage" class="Both" displayName="$(string.DisableSecurityPage)" explainText="$(string.DisableSecurityPage_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Control Panel" valueName="SecurityTab">
      <parentCategory ref="IE:InternetControlPanel" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableBrowsingHistory" class="Both" displayName="$(string.DisableBrowsingHistory)" explainText="$(string.DisableBrowsingHistory_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Privacy" valueName="ClearBrowsingHistoryOnExit">
      <parentCategory ref="IE:GeneralPage" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DeleteBrowsingHistory" class="Both" displayName="$(string.DeleteBrowsingHistory)" explainText="$(string.DeleteBrowsingHistory_Help)" key="SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\Privacy" valueName="DisableDeleteBrowsingHistory">
      <parentCategory ref="IE:GeneralPage" /><supportedOn ref="IE:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="$(string.SUPPORTED_WindowsXP)" />
    </definitions>
  </supportedOn>
</policyDefinitions>''')

write_adml("InternetExplorer.adml", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <displayName>Internet Explorer Administrative Templates</displayName>
  <description>Administrative Vorlagen für Internet Explorer</description>
  <resources>
    <stringTable>
      <string id="InternetExplorer">Internet Explorer</string>
      <string id="InternetControlPanel">Internetoptionen</string>
      <string id="SecurityPage">Sicherheit</string>
      <string id="GeneralPage">Allgemein</string>
      <string id="DisableHomePageChange">Startseite ändern deaktivieren</string>
      <string id="DisableHomePageChange_Help">Verhindert das Ändern der Startseite.</string>
      <string id="HomePage">Startseite festlegen</string>
      <string id="HomePage_Help">Legt die Standard-Startseite fest.</string>
      <string id="DisableSearchProviderChange">Suchanbieter ändern deaktivieren</string>
      <string id="DisableSearchProviderChange_Help">Verhindert das Ändern des Suchanbieters.</string>
      <string id="DisableProxyChange">Proxy ändern deaktivieren</string>
      <string id="DisableProxyChange_Help">Verhindert das Ändern der Proxy-Einstellungen.</string>
      <string id="ProxyServer">Proxyserver</string>
      <string id="ProxyServer_Help">Legt den Proxyserver fest (z.B. proxy:8080).</string>
      <string id="ProxyOverride">Proxyausnahmen</string>
      <string id="ProxyOverride_Help">Legt Adressen fest, die den Proxy umgehen.</string>
      <string id="DisableSecurityPage">Sicherheitsseite deaktivieren</string>
      <string id="DisableSecurityPage_Help">Deaktiviert die Sicherheitsseite in den Internetoptionen.</string>
      <string id="DisableBrowsingHistory">Verlauf beim Beenden löschen</string>
      <string id="DisableBrowsingHistory_Help">Löscht den Browserverlauf beim Beenden.</string>
      <string id="DeleteBrowsingHistory">Verlauf löschen deaktivieren</string>
      <string id="DeleteBrowsingHistory_Help">Deaktiviert die Option zum Löschen des Browserverlaufs.</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
    </stringTable>
    <presentationTable>
      <presentation id="HomePage"><textBox refId="HomePage"><label>URL:</label><defaultValue>about:blank</defaultValue></textBox></presentation>
      <presentation id="ProxyServer"><textBox refId="ProxyServer"><label>Server:Port:</label></textBox></presentation>
      <presentation id="ProxyOverride"><textBox refId="ProxyOverride"><label>Ausnahmen:</label><defaultValue>&lt;local&gt;</defaultValue></textBox></presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>''')

# MicrosoftEdge.admx
write_file("MicrosoftEdge.admx", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <policyNamespaces><target prefix="Edge" namespace="Microsoft.Policies.Edge" /></policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="MicrosoftEdge" displayName="$(string.MicrosoftEdge)"><parentCategory ref="Edge:WindowsComponents" /></category>
    <category name="StartupHomepage" displayName="$(string.StartupHomepage)"><parentCategory ref="Edge:MicrosoftEdge" /></category>
    <category name="SearchEngine" displayName="$(string.SearchEngine)"><parentCategory ref="Edge:MicrosoftEdge" /></category>
    <category name="Security" displayName="$(string.Security)"><parentCategory ref="Edge:MicrosoftEdge" /></category>
    <category name="Extensions" displayName="$(string.Extensions)"><parentCategory ref="Edge:MicrosoftEdge" /></category>
  </categories>
  <policies>
    <policy name="HomepageLocation" class="Both" displayName="$(string.HomepageLocation)" explainText="$(string.HomepageLocation_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="HomepageLocation">
      <parentCategory ref="Edge:StartupHomepage" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <elements><text id="HomepageLocation" valueName="HomepageLocation" /></elements>
    </policy>
    <policy name="RestoreOnStartup" class="Both" displayName="$(string.RestoreOnStartup)" explainText="$(string.RestoreOnStartup_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="RestoreOnStartup">
      <parentCategory ref="Edge:StartupHomepage" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <elements><enum id="RestoreOnStartup" valueName="RestoreOnStartup">
        <item displayName="$(string.RestoreOnStartup_1)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.RestoreOnStartup_4)"><value><decimal value="4" /></value></item>
        <item displayName="$(string.RestoreOnStartup_5)"><value><decimal value="5" /></value></item>
      </enum></elements>
    </policy>
    <policy name="HomepageIsNewTabPage" class="Both" displayName="$(string.HomepageIsNewTabPage)" explainText="$(string.HomepageIsNewTabPage_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="HomepageIsNewTabPage">
      <parentCategory ref="Edge:StartupHomepage" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DefaultSearchProviderEnabled" class="Both" displayName="$(string.DefaultSearchProviderEnabled)" explainText="$(string.DefaultSearchProviderEnabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="DefaultSearchProviderEnabled">
      <parentCategory ref="Edge:SearchEngine" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DefaultSearchProviderName" class="Both" displayName="$(string.DefaultSearchProviderName)" explainText="$(string.DefaultSearchProviderName_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="DefaultSearchProviderName">
      <parentCategory ref="Edge:SearchEngine" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <elements><text id="DefaultSearchProviderName" valueName="DefaultSearchProviderName" /></elements>
    </policy>
    <policy name="SmartScreenEnabled" class="Both" displayName="$(string.SmartScreenEnabled)" explainText="$(string.SmartScreenEnabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="SmartScreenEnabled">
      <parentCategory ref="Edge:Security" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="PasswordManagerEnabled" class="Both" displayName="$(string.PasswordManagerEnabled)" explainText="$(string.PasswordManagerEnabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="PasswordManagerEnabled">
      <parentCategory ref="Edge:Security" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="AutofillAddressEnabled" class="Both" displayName="$(string.AutofillAddressEnabled)" explainText="$(string.AutofillAddressEnabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="AutofillAddressEnabled">
      <parentCategory ref="Edge:Security" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="AutofillCreditCardEnabled" class="Both" displayName="$(string.AutofillCreditCardEnabled)" explainText="$(string.AutofillCreditCardEnabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="AutofillCreditCardEnabled">
      <parentCategory ref="Edge:Security" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="BrowserSignin" class="Both" displayName="$(string.BrowserSignin)" explainText="$(string.BrowserSignin_Help)" key="SOFTWARE\\Policies\\Microsoft\\Edge" valueName="BrowserSignin">
      <parentCategory ref="Edge:MicrosoftEdge" /><supportedOn ref="Edge:SUPPORTED_Edge" />
      <elements><enum id="BrowserSignin" valueName="BrowserSignin">
        <item displayName="$(string.BrowserSignin_0)"><value><decimal value="0" /></value></item>
        <item displayName="$(string.BrowserSignin_1)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.BrowserSignin_2)"><value><decimal value="2" /></value></item>
      </enum></elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_Edge" displayName="$(string.SUPPORTED_Edge)" />
    </definitions>
  </supportedOn>
</policyDefinitions>''')

write_adml("MicrosoftEdge.adml", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <displayName>Microsoft Edge Administrative Templates</displayName>
  <description>Administrative Vorlagen für Microsoft Edge</description>
  <resources>
    <stringTable>
      <string id="MicrosoftEdge">Microsoft Edge</string>
      <string id="StartupHomepage">Startseite</string>
      <string id="SearchEngine">Suchmaschine</string>
      <string id="Security">Sicherheit</string>
      <string id="Extensions">Erweiterungen</string>
      <string id="HomepageLocation">Startseite festlegen</string>
      <string id="HomepageLocation_Help">Legt die Startseite für Edge fest.</string>
      <string id="RestoreOnStartup">Startverhalten</string>
      <string id="RestoreOnStartup_Help">Legt fest, was beim Start von Edge angezeigt wird.</string>
      <string id="RestoreOnStartup_1">Startseite anzeigen</string>
      <string id="RestoreOnStartup_4">Zuletzt geöffnete Seiten wiederherstellen</string>
      <string id="RestoreOnStartup_5">Bestimmte Seiten festlegen</string>
      <string id="HomepageIsNewTabPage">Neuer Tab als Startseite</string>
      <string id="HomepageIsNewTabPage_Help">Verwendet die neue Tab-Seite als Startseite.</string>
      <string id="DefaultSearchProviderEnabled">Standard-Suchmaschine aktivieren</string>
      <string id="DefaultSearchProviderEnabled_Help">Aktiviert die Standard-Suchmaschine.</string>
      <string id="DefaultSearchProviderName">Name der Suchmaschine</string>
      <string id="DefaultSearchProviderName_Help">Legt den Namen der Standard-Suchmaschine fest.</string>
      <string id="SmartScreenEnabled">SmartScreen aktivieren</string>
      <string id="SmartScreenEnabled_Help">Aktiviert den Microsoft SmartScreen-Filter.</string>
      <string id="PasswordManagerEnabled">Passwort-Manager</string>
      <string id="PasswordManagerEnabled_Help">Aktiviert den integrierten Passwort-Manager.</string>
      <string id="AutofillAddressEnabled">Adressen-Autovervollständigung</string>
      <string id="AutofillAddressEnabled_Help">Aktiviert die Autovervollständigung für Adressen.</string>
      <string id="AutofillCreditCardEnabled">Kreditkarten-Autovervollständigung</string>
      <string id="AutofillCreditCardEnabled_Help">Aktiviert die Autovervollständigung für Kreditkarten.</string>
      <string id="BrowserSignin">Browser-Anmeldung</string>
      <string id="BrowserSignin_Help">Legt fest, ob Benutzer sich bei Edge anmelden können.</string>
      <string id="BrowserSignin_0">Anmeldung deaktivieren</string>
      <string id="BrowserSignin_1">Anmeldung zulassen</string>
      <string id="BrowserSignin_2">Anmeldung erzwingen</string>
      <string id="SUPPORTED_Edge">Mindestens Microsoft Edge 77</string>
    </stringTable>
    <presentationTable>
      <presentation id="HomepageLocation"><textBox refId="HomepageLocation"><label>URL:</label></textBox></presentation>
      <presentation id="RestoreOnStartup"><dropdownList refId="RestoreOnStartup" defaultItem="1" /></presentation>
      <presentation id="DefaultSearchProviderName"><textBox refId="DefaultSearchProviderName"><label>Name:</label></textBox></presentation>
      <presentation id="BrowserSignin"><dropdownList refId="BrowserSignin" defaultItem="1" /></presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>''')

# RemoteDesktopServices.admx
write_file("RemoteDesktopServices.admx", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <policyNamespaces><target prefix="RDP" namespace="Microsoft.Policies.RemoteDesktopServices" /></policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="RemoteDesktopServices" displayName="$(string.RemoteDesktopServices)"><parentCategory ref="RDP:WindowsComponents" /></category>
    <category name="RDSessionHost" displayName="$(string.RDSessionHost)"><parentCategory ref="RDP:RemoteDesktopServices" /></category>
    <category name="Connections" displayName="$(string.Connections)"><parentCategory ref="RDP:RDSessionHost" /></category>
    <category name="SessionTimeLimits" displayName="$(string.SessionTimeLimits)"><parentCategory ref="RDP:RDSessionHost" /></category>
    <category name="DeviceRedirection" displayName="$(string.DeviceRedirection)"><parentCategory ref="RDP:RDSessionHost" /></category>
    <category name="Security" displayName="$(string.Security)"><parentCategory ref="RDP:RDSessionHost" /></category>
  </categories>
  <policies>
    <policy name="fDenyTSConnections" class="Machine" displayName="$(string.fDenyTSConnections)" explainText="$(string.fDenyTSConnections_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="fDenyTSConnections">
      <parentCategory ref="RDP:Connections" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="MaxInstanceCount" class="Machine" displayName="$(string.MaxInstanceCount)" explainText="$(string.MaxInstanceCount_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="MaxInstanceCount">
      <parentCategory ref="RDP:Connections" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <elements><decimal id="MaxInstanceCount" valueName="MaxInstanceCount" minValue="1" maxValue="999999" /></elements>
    </policy>
    <policy name="fSingleSessionPerUser" class="Machine" displayName="$(string.fSingleSessionPerUser)" explainText="$(string.fSingleSessionPerUser_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="fSingleSessionPerUser">
      <parentCategory ref="RDP:Connections" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="MaxConnectionTime" class="Machine" displayName="$(string.MaxConnectionTime)" explainText="$(string.MaxConnectionTime_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="MaxConnectionTime">
      <parentCategory ref="RDP:SessionTimeLimits" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <elements><decimal id="MaxConnectionTime" valueName="MaxConnectionTime" minValue="0" maxValue="720" /></elements>
    </policy>
    <policy name="MaxIdleTime" class="Machine" displayName="$(string.MaxIdleTime)" explainText="$(string.MaxIdleTime_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="MaxIdleTime">
      <parentCategory ref="RDP:SessionTimeLimits" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <elements><decimal id="MaxIdleTime" valueName="MaxIdleTime" minValue="0" maxValue="720" /></elements>
    </policy>
    <policy name="fDisableCdm" class="Machine" displayName="$(string.fDisableCdm)" explainText="$(string.fDisableCdm_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="fDisableCdm">
      <parentCategory ref="RDP:DeviceRedirection" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="fDisableClip" class="Machine" displayName="$(string.fDisableClip)" explainText="$(string.fDisableClip_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="fDisableClip">
      <parentCategory ref="RDP:DeviceRedirection" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="SecurityLayer" class="Machine" displayName="$(string.SecurityLayer)" explainText="$(string.SecurityLayer_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="SecurityLayer">
      <parentCategory ref="RDP:Security" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <elements><enum id="SecurityLayer" valueName="SecurityLayer">
        <item displayName="$(string.SecurityLayer_RDP)"><value><decimal value="0" /></value></item>
        <item displayName="$(string.SecurityLayer_SSL)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.SecurityLayer_NLA)"><value><decimal value="2" /></value></item>
      </enum></elements>
    </policy>
    <policy name="UserAuthentication" class="Machine" displayName="$(string.UserAuthentication)" explainText="$(string.UserAuthentication_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="UserAuthentication">
      <parentCategory ref="RDP:Security" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="MinEncryptionLevel" class="Machine" displayName="$(string.MinEncryptionLevel)" explainText="$(string.MinEncryptionLevel_Help)" key="SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services" valueName="MinEncryptionLevel">
      <parentCategory ref="RDP:Security" /><supportedOn ref="RDP:SUPPORTED_WindowsXP" />
      <elements><enum id="MinEncryptionLevel" valueName="MinEncryptionLevel">
        <item displayName="$(string.Encryption_Low)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.Encryption_Client)"><value><decimal value="2" /></value></item>
        <item displayName="$(string.Encryption_High)"><value><decimal value="3" /></value></item>
        <item displayName="$(string.Encryption_FIPS)"><value><decimal value="4" /></value></item>
      </enum></elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="$(string.SUPPORTED_WindowsXP)" />
    </definitions>
  </supportedOn>
</policyDefinitions>''')

write_adml("RemoteDesktopServices.adml", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <displayName>Remote Desktop Services Administrative Templates</displayName>
  <description>Administrative Vorlagen für Remotedesktopdienste</description>
  <resources>
    <stringTable>
      <string id="RemoteDesktopServices">Remotedesktopdienste</string>
      <string id="RDSessionHost">RD-Sitzungshost</string>
      <string id="Connections">Verbindungen</string>
      <string id="SessionTimeLimits">Sitzungszeitlimits</string>
      <string id="DeviceRedirection">Geräteumleitung</string>
      <string id="Security">Sicherheit</string>
      <string id="fDenyTSConnections">Verbindungen nicht zulassen</string>
      <string id="fDenyTSConnections_Help">Verhindert eingehende Remotedesktopverbindungen.</string>
      <string id="MaxInstanceCount">Maximale Verbindungen</string>
      <string id="MaxInstanceCount_Help">Legt die maximale Anzahl gleichzeitiger Verbindungen fest.</string>
      <string id="fSingleSessionPerUser">Eine Sitzung pro Benutzer</string>
      <string id="fSingleSessionPerUser_Help">Beschränkt Benutzer auf eine aktive Sitzung.</string>
      <string id="MaxConnectionTime">Maximale Verbindungsdauer (Min)</string>
      <string id="MaxConnectionTime_Help">Legt die maximale Verbindungsdauer in Minuten fest (0=unbegrenzt).</string>
      <string id="MaxIdleTime">Maximale Leerlaufzeit (Min)</string>
      <string id="MaxIdleTime_Help">Legt die maximale Leerlaufzeit in Minuten fest (0=unbegrenzt).</string>
      <string id="fDisableCdm">Laufwerkumleitung deaktivieren</string>
      <string id="fDisableCdm_Help">Deaktiviert die Umleitung von Laufwerken.</string>
      <string id="fDisableClip">Zwischenablage deaktivieren</string>
      <string id="fDisableClip_Help">Deaktiviert die Zwischenablageumleitung.</string>
      <string id="SecurityLayer">Sicherheitsebene</string>
      <string id="SecurityLayer_Help">Legt die Sicherheitsebene für Verbindungen fest.</string>
      <string id="SecurityLayer_RDP">RDP-Sicherheit</string>
      <string id="SecurityLayer_SSL">SSL (TLS 1.0)</string>
      <string id="SecurityLayer_NLA">NLA (Network Level Authentication)</string>
      <string id="UserAuthentication">NLA-Authentifizierung</string>
      <string id="UserAuthentication_Help">Erfordert Netzwerk-Level-Authentifizierung.</string>
      <string id="MinEncryptionLevel">Minimale Verschlüsselungsstufe</string>
      <string id="MinEncryptionLevel_Help">Legt die minimale Verschlüsselungsstufe fest.</string>
      <string id="Encryption_Low">Niedrig</string>
      <string id="Encryption_Client">Clientkompatibel</string>
      <string id="Encryption_High">Hoch</string>
      <string id="Encryption_FIPS">FIPS-kompatibel</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
    </stringTable>
    <presentationTable>
      <presentation id="MaxInstanceCount"><decimalTextBox refId="MaxInstanceCount" defaultValue="999999" label="Max. Verbindungen:" /></presentation>
      <presentation id="MaxConnectionTime"><decimalTextBox refId="MaxConnectionTime" defaultValue="0" label="Minuten (0=unbegrenzt):" /></presentation>
      <presentation id="MaxIdleTime"><decimalTextBox refId="MaxIdleTime" defaultValue="0" label="Minuten (0=unbegrenzt):" /></presentation>
      <presentation id="SecurityLayer"><dropdownList refId="SecurityLayer" defaultItem="2" /></presentation>
      <presentation id="MinEncryptionLevel"><dropdownList refId="MinEncryptionLevel" defaultItem="3" /></presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>''')

# PowerManagement.admx
write_file("PowerManagement.admx", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <policyNamespaces><target prefix="Power" namespace="Microsoft.Policies.PowerManagement" /></policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="PowerManagement" displayName="$(string.PowerManagement)"><parentCategory ref="Power:System" /></category>
    <category name="SleepSettings" displayName="$(string.SleepSettings)"><parentCategory ref="Power:PowerManagement" /></category>
    <category name="ButtonSettings" displayName="$(string.ButtonSettings)"><parentCategory ref="Power:PowerManagement" /></category>
  </categories>
  <policies>
    <policy name="SleepDisabled" class="Machine" displayName="$(string.SleepDisabled)" explainText="$(string.SleepDisabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\abfc2519-3608-4c2a-94ea-171b0ed546ab" valueName="ACSettingIndex">
      <parentCategory ref="Power:SleepSettings" /><supportedOn ref="Power:SUPPORTED_Windows7" />
      <enabledValue><decimal value="0" /></enabledValue><disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="HibernateDisabled" class="Machine" displayName="$(string.HibernateDisabled)" explainText="$(string.HibernateDisabled_Help)" key="SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\94ac6d29-73ce-41a6-809f-6363ba21b47e" valueName="ACSettingIndex">
      <parentCategory ref="Power:SleepSettings" /><supportedOn ref="Power:SUPPORTED_Windows7" />
      <enabledValue><decimal value="0" /></enabledValue><disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="PowerButtonAction" class="Machine" displayName="$(string.PowerButtonAction)" explainText="$(string.PowerButtonAction_Help)" key="SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\7648EFA3-DD9C-4E3E-B566-10F9E5B3B1E3" valueName="ACSettingIndex">
      <parentCategory ref="Power:ButtonSettings" /><supportedOn ref="Power:SUPPORTED_Windows7" />
      <elements><enum id="PowerButtonAction" valueName="ACSettingIndex">
        <item displayName="$(string.Action_DoNothing)"><value><decimal value="0" /></value></item>
        <item displayName="$(string.Action_Sleep)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.Action_Hibernate)"><value><decimal value="2" /></value></item>
        <item displayName="$(string.Action_Shutdown)"><value><decimal value="3" /></value></item>
      </enum></elements>
    </policy>
    <policy name="SleepButtonAction" class="Machine" displayName="$(string.SleepButtonAction)" explainText="$(string.SleepButtonAction_Help)" key="SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\96996BC0-5B56-4373-B2B4-A7B2B0F1D0D9" valueName="ACSettingIndex">
      <parentCategory ref="Power:ButtonSettings" /><supportedOn ref="Power:SUPPORTED_Windows7" />
      <elements><enum id="SleepButtonAction" valueName="ACSettingIndex">
        <item displayName="$(string.Action_DoNothing)"><value><decimal value="0" /></value></item>
        <item displayName="$(string.Action_Sleep)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.Action_Hibernate)"><value><decimal value="2" /></value></item>
        <item displayName="$(string.Action_Shutdown)"><value><decimal value="3" /></value></item>
      </enum></elements>
    </policy>
    <policy name="LidCloseAction" class="Machine" displayName="$(string.LidCloseAction)" explainText="$(string.LidCloseAction_Help)" key="SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings\\5CA83367-6E45-459F-A27B-476B1D01C936" valueName="ACSettingIndex">
      <parentCategory ref="Power:ButtonSettings" /><supportedOn ref="Power:SUPPORTED_Windows7" />
      <elements><enum id="LidCloseAction" valueName="ACSettingIndex">
        <item displayName="$(string.Action_DoNothing)"><value><decimal value="0" /></value></item>
        <item displayName="$(string.Action_Sleep)"><value><decimal value="1" /></value></item>
        <item displayName="$(string.Action_Hibernate)"><value><decimal value="2" /></value></item>
        <item displayName="$(string.Action_Shutdown)"><value><decimal value="3" /></value></item>
      </enum></elements>
    </policy>
  </policies>
  <supportedOn><definitions><definition name="SUPPORTED_Windows7" displayName="$(string.SUPPORTED_Windows7)" /></definitions></supportedOn>
</policyDefinitions>''')

write_adml("PowerManagement.adml", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <displayName>Power Management Administrative Templates</displayName>
  <description>Administrative Vorlagen für Energieverwaltung</description>
  <resources>
    <stringTable>
      <string id="System">System</string>
      <string id="PowerManagement">Energieverwaltung</string>
      <string id="SleepSettings">Energiesparmodus</string>
      <string id="ButtonSettings">Tasteneinstellungen</string>
      <string id="SleepDisabled">Standby deaktivieren</string>
      <string id="SleepDisabled_Help">Deaktiviert den Standby-Modus.</string>
      <string id="HibernateDisabled">Ruhezustand deaktivieren</string>
      <string id="HibernateDisabled_Help">Deaktiviert den Ruhezustand.</string>
      <string id="PowerButtonAction">Aktion Netzschalter</string>
      <string id="PowerButtonAction_Help">Legt die Aktion beim Drücken des Netzschalters fest.</string>
      <string id="SleepButtonAction">Aktion Standby-Taste</string>
      <string id="SleepButtonAction_Help">Legt die Aktion beim Drücken der Standby-Taste fest.</string>
      <string id="LidCloseAction">Aktion bei Deckelschluss</string>
      <string id="LidCloseAction_Help">Legt die Aktion beim Schließen des Laptopdeckels fest.</string>
      <string id="Action_DoNothing">Nichts unternehmen</string>
      <string id="Action_Sleep">Standby</string>
      <string id="Action_Hibernate">Ruhezustand</string>
      <string id="Action_Shutdown">Herunterfahren</string>
      <string id="SUPPORTED_Windows7">Mindestens Windows 7</string>
    </stringTable>
    <presentationTable>
      <presentation id="PowerButtonAction"><dropdownList refId="PowerButtonAction" defaultItem="3" /></presentation>
      <presentation id="SleepButtonAction"><dropdownList refId="SleepButtonAction" defaultItem="1" /></presentation>
      <presentation id="LidCloseAction"><dropdownList refId="LidCloseAction" defaultItem="1" /></presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>''')

# WindowsTimeService.admx
write_file("WindowsTimeService.admx", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <policyNamespaces><target prefix="W32Time" namespace="Microsoft.Policies.WindowsTimeService" /></policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="WindowsTimeService" displayName="$(string.WindowsTimeService)"><parentCategory ref="W32Time:System" /></category>
    <category name="TimeProviders" displayName="$(string.TimeProviders)"><parentCategory ref="W32Time:WindowsTimeService" /></category>
  </categories>
  <policies>
    <policy name="W32Time_NtpClient" class="Machine" displayName="$(string.W32Time_NtpClient)" explainText="$(string.W32Time_NtpClient_Help)" key="SOFTWARE\\Policies\\Microsoft\\W32Time\\TimeProviders\\NtpClient" valueName="Enabled">
      <parentCategory ref="W32Time:TimeProviders" /><supportedOn ref="W32Time:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue><disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="W32Time_NtpServer" class="Machine" displayName="$(string.W32Time_NtpServer)" explainText="$(string.W32Time_NtpServer_Help)" key="SOFTWARE\\Policies\\Microsoft\\W32Time\\Parameters" valueName="NtpServer">
      <parentCategory ref="W32Time:TimeProviders" /><supportedOn ref="W32Time:SUPPORTED_WindowsXP" />
      <elements><text id="NtpServer" valueName="NtpServer" /></elements>
    </policy>
  </policies>
  <supportedOn><definitions><definition name="SUPPORTED_WindowsXP" displayName="$(string.SUPPORTED_WindowsXP)" /></definitions></supportedOn>
</policyDefinitions>''')

write_adml("WindowsTimeService.adml", '''<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" revision="1.0" schemaVersion="1.0">
  <displayName>Windows Time Service Administrative Templates</displayName>
  <description>Administrative Vorlagen für den Windows-Zeitdienst</description>
  <resources>
    <stringTable>
      <string id="System">System</string>
      <string id="WindowsTimeService">Windows-Zeitdienst</string>
      <string id="TimeProviders">Zeitanbieter</string>
      <string id="W32Time_NtpClient">NTP-Client aktivieren</string>
      <string id="W32Time_NtpClient_Help">Aktiviert den NTP-Client.</string>
      <string id="W32Time_NtpServer">NTP-Server konfigurieren</string>
      <string id="W32Time_NtpServer_Help">Legt den NTP-Server fest.</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
    </stringTable>
    <presentationTable>
      <presentation id="W32Time_NtpServer"><textBox refId="NtpServer"><label>NTP-Server:</label><defaultValue>time.windows.com</defaultValue></textBox></presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>''')

# Set permissions
subprocess.run(["chown", "-R", "BUILTIN\\administrators:BUILTIN\\administrators", POLICY_DEFS], check=False)
subprocess.run(["chmod", "-R", "775", POLICY_DEFS], check=False)

print()
print("=== ADMX PolicyDefinitions initialized successfully! ===")
print()

# Count files
admx_count = len([f for f in os.listdir(POLICY_DEFS) if f.endswith('.admx')])
adml_count = len([f for f in os.path.join(POLICY_DEFS, "en-US") if f.endswith('.adml')])
print(f"Created {admx_count} ADMX files and {adml_count} ADML files")
