#!/bin/bash
# Initialize ADMX PolicyDefinitions for Samba AD

DOMAIN="bsw.local"
SYSVOL_BASE="/var/lib/samba/sysvol"
POLICY_DEFS="$SYSVOL_BASE/$DOMAIN/PolicyDefinitions"

mkdir -p "$POLICY_DEFS/en-US"

# Windows.admx
cat > "$POLICY_DEFS/windows.admx" << 'ADMX_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                    revision="1.0" 
                    schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="windows" namespace="Microsoft.Policies.Windows" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="Windows" displayName="$(string.Windows)" />
    <category name="WindowsComponents" displayName="$(string.WindowsComponents)">
      <parentCategory ref="windows:Windows" />
    </category>
    <category name="WindowsUpdate" displayName="$(string.WindowsUpdate)">
      <parentCategory ref="windows:WindowsComponents" />
    </category>
    <category name="System" displayName="$(string.System)">
      <parentCategory ref="windows:Windows" />
    </category>
    <category name="Logon" displayName="$(string.Logon)">
      <parentCategory ref="windows:System" />
    </category>
    <category name="Network" displayName="$(string.Network)">
      <parentCategory ref="windows:Windows" />
    </category>
    <category name="Firewall" displayName="$(string.Firewall)">
      <parentCategory ref="windows:Network" />
    </category>
  </categories>
  <policies>
    <policy name="NoAutoUpdate" class="Machine" displayName="$(string.NoAutoUpdate)" 
            explainText="$(string.NoAutoUpdate_Help)" key="SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" valueName="NoAutoUpdate">
      <parentCategory ref="windows:WindowsUpdate" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="0" /></enabledValue>
      <disabledValue><decimal value="1" /></disabledValue>
      <elements>
        <decimal id="NoAutoUpdate" valueName="NoAutoUpdate" minValue="0" maxValue="4" />
      </elements>
    </policy>
    <policy name="RebootRelaunchTimeoutEnabled" class="Machine" displayName="$(string.RebootRelaunchTimeoutEnabled)" 
            explainText="$(string.RebootRelaunchTimeoutEnabled_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU" valueName="RebootRelaunchTimeoutEnabled">
      <parentCategory ref="windows:WindowsUpdate" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="LegalNoticeCaption" class="Machine" displayName="$(string.LegalNoticeCaption)" 
            explainText="$(string.LegalNoticeCaption_Help)" 
            key="SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" valueName="legalnoticecaption">
      <parentCategory ref="windows:Logon" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <elements>
        <text id="LegalNoticeCaption" valueName="legalnoticecaption" />
      </elements>
    </policy>
    <policy name="LegalNoticeText" class="Machine" displayName="$(string.LegalNoticeText)" 
            explainText="$(string.LegalNoticeText_Help)" 
            key="SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" valueName="legalnoticetext">
      <parentCategory ref="windows:Logon" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <elements>
        <text id="LegalNoticeText" valueName="legalnoticetext" />
      </elements>
    </policy>
    <policy name="EnableFirewall" class="Machine" displayName="$(string.EnableFirewall)" 
            explainText="$(string.EnableFirewall_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile" valueName="EnableFirewall">
      <parentCategory ref="windows:Firewall" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableNotifications" class="User" displayName="$(string.DisableNotifications)" 
            explainText="$(string.DisableNotifications_Help)" 
            key="SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications" valueName="NoToastApplicationNotification">
      <parentCategory ref="windows:System" />
      <supportedOn ref="windows:SUPPORTED_Windows8" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableLockScreen" class="Machine" displayName="$(string.DisableLockScreen)" 
            explainText="$(string.DisableLockScreen_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\Personalization" valueName="NoLockScreen">
      <parentCategory ref="windows:System" />
      <supportedOn ref="windows:SUPPORTED_Windows8" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableCortana" class="Machine" displayName="$(string.DisableCortana)" 
            explainText="$(string.DisableCortana_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\Windows Search" valueName="AllowCortana">
      <parentCategory ref="windows:WindowsComponents" />
      <supportedOn ref="windows:SUPPORTED_Windows10" />
      <enabledValue><decimal value="0" /></enabledValue>
      <disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="DisableTelemetry" class="Machine" displayName="$(string.DisableTelemetry)" 
            explainText="$(string.DisableTelemetry_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\DataCollection" valueName="AllowTelemetry">
      <parentCategory ref="windows:WindowsComponents" />
      <supportedOn ref="windows:SUPPORTED_Windows10" />
      <elements>
        <decimal id="TelemetryLevel" valueName="AllowTelemetry" minValue="0" maxValue="3" />
      </elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="$(string.SUPPORTED_WindowsXP)" />
      <definition name="SUPPORTED_Windows8" displayName="$(string.SUPPORTED_Windows8)" />
      <definition name="SUPPORTED_Windows10" displayName="$(string.SUPPORTED_Windows10)" />
    </definitions>
  </supportedOn>
</policyDefinitions>
ADMX_EOF

# Windows.adml
cat > "$POLICY_DEFS/en-US/windows.adml" << 'ADML_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                           xmlns:xsd="http://www.w3.org/2001/XMLSchema" 
                           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
                           revision="1.0" 
                           schemaVersion="1.0">
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
      <string id="NoAutoUpdate">Automatische Updates konfigurieren</string>
      <string id="NoAutoUpdate_Help">Legt fest, ob automatische Updates aktiviert sind. Wenn diese Richtlinie aktiviert ist, werden automatische Updates deaktiviert.</string>
      <string id="RebootRelaunchTimeoutEnabled">Benachrichtigung für geplante Neustarts</string>
      <string id="RebootRelaunchTimeoutEnabled_Help">Legt fest, ob Benutzer über geplante Neustarts benachrichtigt werden.</string>
      <string id="LegalNoticeCaption">Anmeldehinweis anzeigen</string>
      <string id="LegalNoticeCaption_Help">Zeigt einen Hinweis vor der Anmeldung an. Der Text wird im Titel des Dialogfelds angezeigt.</string>
      <string id="LegalNoticeText">Anmeldehinweistext</string>
      <string id="LegalNoticeText_Help">Der Text, der im Anmeldehinweis angezeigt wird.</string>
      <string id="EnableFirewall">Windows-Firewall aktivieren</string>
      <string id="EnableFirewall_Help">Aktiviert die Windows-Firewall für Domänenprofile.</string>
      <string id="DisableNotifications">Benachrichtigungen deaktivieren</string>
      <string id="DisableNotifications_Help">Deaktiviert Toast-Benachrichtigungen für den Benutzer.</string>
      <string id="DisableLockScreen">Sperrbildschirm deaktivieren</string>
      <string id="DisableLockScreen_Help">Deaktiviert den Sperrbildschirm auf dem Gerät.</string>
      <string id="DisableCortana">Cortana deaktivieren</string>
      <string id="DisableCortana_Help">Deaktiviert den digitalen Assistenten Cortana.</string>
      <string id="DisableTelemetry">Telemetrie konfigurieren</string>
      <string id="DisableTelemetry_Help">Legt das Telemetrie-Level fest (0=Sicher, 1=Notwendig, 2=Erweitert, 3=Vollständig).</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
      <string id="SUPPORTED_Windows8">Mindestens Windows 8</string>
      <string id="SUPPORTED_Windows10">Mindestens Windows 10</string>
    </stringTable>
    <presentationTable>
      <presentation id="NoAutoUpdate">
        <decimalTextBox refId="NoAutoUpdate" defaultValue="0" label="Automatische Updates (0=aktiv, 1=deaktiviert):" />
      </presentation>
      <presentation id="LegalNoticeCaption">
        <textBox refId="LegalNoticeCaption">
          <label>Anmeldehinweistitel:</label>
        </textBox>
      </presentation>
      <presentation id="LegalNoticeText">
        <textBox refId="LegalNoticeText">
          <label>Anmeldehinweistext:</label>
        </textBox>
      </presentation>
      <presentation id="DisableTelemetry">
        <decimalTextBox refId="TelemetryLevel" defaultValue="0" label="Telemetrie-Level (0-3):" />
      </presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>
ADML_EOF

# WindowsFirewall.admx
cat > "$POLICY_DEFS/WindowsFirewall.admx" << 'ADMX_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="Firewall" namespace="Microsoft.Policies.WindowsFirewall" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="WindowsFirewall" displayName="$(string.WindowsFirewall)">
      <parentCategory ref="Firewall:Network" />
    </category>
    <category name="DomainProfile" displayName="$(string.DomainProfile)">
      <parentCategory ref="Firewall:WindowsFirewall" />
    </category>
    <category name="StandardProfile" displayName="$(string.StandardProfile)">
      <parentCategory ref="Firewall:WindowsFirewall" />
    </category>
    <category name="PublicProfile" displayName="$(string.PublicProfile)">
      <parentCategory ref="Firewall:WindowsFirewall" />
    </category>
  </categories>
  <policies>
    <policy name="EnableFirewallDomain" class="Machine" displayName="$(string.EnableFirewallDomain)" 
            explainText="$(string.EnableFirewallDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile" valueName="EnableFirewall">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="EnableFirewallStandard" class="Machine" displayName="$(string.EnableFirewallStandard)" 
            explainText="$(string.EnableFirewallStandard_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\StandardProfile" valueName="EnableFirewall">
      <parentCategory ref="Firewall:StandardProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="EnableFirewallPublic" class="Machine" displayName="$(string.EnableFirewallPublic)" 
            explainText="$(string.EnableFirewallPublic_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\PublicProfile" valueName="EnableFirewall">
      <parentCategory ref="Firewall:PublicProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DefaultInboundActionDomain" class="Machine" displayName="$(string.DefaultInboundActionDomain)" 
            explainText="$(string.DefaultInboundActionDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile" valueName="DefaultInboundAction">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <elements>
        <enum id="DefaultInboundAction" valueName="DefaultInboundAction">
          <item displayName="$(string.Block)"><value><decimal value="1" /></value></item>
          <item displayName="$(string.Allow)"><value><decimal value="0" /></value></item>
        </enum>
      </elements>
    </policy>
    <policy name="DefaultOutboundActionDomain" class="Machine" displayName="$(string.DefaultOutboundActionDomain)" 
            explainText="$(string.DefaultOutboundActionDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile" valueName="DefaultOutboundAction">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <elements>
        <enum id="DefaultOutboundAction" valueName="DefaultOutboundAction">
          <item displayName="$(string.Block)"><value><decimal value="1" /></value></item>
          <item displayName="$(string.Allow)"><value><decimal value="0" /></value></item>
        </enum>
      </elements>
    </policy>
    <policy name="DisableNotificationsDomain" class="Machine" displayName="$(string.DisableNotificationsDomain)" 
            explainText="$(string.DisableNotificationsDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile" valueName="DisableNotifications">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="LoggingEnabledDomain" class="Machine" displayName="$(string.LoggingEnabledDomain)" 
            explainText="$(string.LoggingEnabledDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile\Logging" valueName="LogSuccessfulConnections">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="LogFilePathDomain" class="Machine" displayName="$(string.LogFilePathDomain)" 
            explainText="$(string.LogFilePathDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile\Logging" valueName="LogFilePath">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <elements>
        <text id="LogFilePath" valueName="LogFilePath" />
      </elements>
    </policy>
    <policy name="LogFileSizeDomain" class="Machine" displayName="$(string.LogFileSizeDomain)" 
            explainText="$(string.LogFileSizeDomain_Help)" 
            key="SOFTWARE\Policies\Microsoft\WindowsFirewall\DomainProfile\Logging" valueName="LogFileSize">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <elements>
        <decimal id="LogFileSize" valueName="LogFileSize" minValue="1" maxValue="32767" />
      </elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="$(string.SUPPORTED_WindowsXP)" />
      <definition name="SUPPORTED_WindowsVista" displayName="$(string.SUPPORTED_WindowsVista)" />
    </definitions>
  </supportedOn>
</policyDefinitions>
ADMX_EOF

# WindowsFirewall.adml
cat > "$POLICY_DEFS/en-US/WindowsFirewall.adml" << 'ADML_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                           revision="1.0" schemaVersion="1.0">
  <displayName>Windows Firewall Administrative Templates</displayName>
  <description>Administrative Vorlagen für Windows-Firewall</description>
  <resources>
    <stringTable>
      <string id="Network">Netzwerk</string>
      <string id="WindowsFirewall">Windows-Firewall</string>
      <string id="DomainProfile">Domänenprofil</string>
      <string id="StandardProfile">Standardprofil</string>
      <string id="PublicProfile">Öffentliches Profil</string>
      <string id="EnableFirewallDomain">Firewall aktivieren (Domäne)</string>
      <string id="EnableFirewallDomain_Help">Aktiviert die Windows-Firewall für das Domänenprofil.</string>
      <string id="EnableFirewallStandard">Firewall aktivieren (Standard)</string>
      <string id="EnableFirewallStandard_Help">Aktiviert die Windows-Firewall für das Standardprofil.</string>
      <string id="EnableFirewallPublic">Firewall aktivieren (Öffentlich)</string>
      <string id="EnableFirewallPublic_Help">Aktiviert die Windows-Firewall für das öffentliche Profil.</string>
      <string id="DefaultInboundActionDomain">Standardaktion eingehend (Domäne)</string>
      <string id="DefaultInboundActionDomain_Help">Legt die Standardaktion für eingehenden Datenverkehr im Domänenprofil fest.</string>
      <string id="DefaultOutboundActionDomain">Standardaktion ausgehend (Domäne)</string>
      <string id="DefaultOutboundActionDomain_Help">Legt die Standardaktion für ausgehenden Datenverkehr im Domänenprofil fest.</string>
      <string id="DisableNotificationsDomain">Benachrichtigungen deaktivieren (Domäne)</string>
      <string id="DisableNotificationsDomain_Help">Deaktiviert Firewall-Benachrichtigungen im Domänenprofil.</string>
      <string id="LoggingEnabledDomain">Protokollierung aktivieren (Domäne)</string>
      <string id="LoggingEnabledDomain_Help">Aktiviert die Protokollierung erfolgreicher Verbindungen im Domänenprofil.</string>
      <string id="LogFilePathDomain">Protokolldateipfad (Domäne)</string>
      <string id="LogFilePathDomain_Help">Legt den Pfad für die Firewall-Protokolldatei im Domänenprofil fest.</string>
      <string id="LogFileSizeDomain">Protokolldateigröße (Domäne)</string>
      <string id="LogFileSizeDomain_Help">Legt die maximale Größe der Firewall-Protokolldatei in KB fest.</string>
      <string id="Block">Blockieren</string>
      <string id="Allow">Zulassen</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
      <string id="SUPPORTED_WindowsVista">Mindestens Windows Vista</string>
    </stringTable>
    <presentationTable>
      <presentation id="DefaultInboundActionDomain">
        <dropdownList refId="DefaultInboundAction" defaultItem="0" />
      </presentation>
      <presentation id="DefaultOutboundActionDomain">
        <dropdownList refId="DefaultOutboundAction" defaultItem="0" />
      </presentation>
      <presentation id="LogFilePathDomain">
        <textBox refId="LogFilePath">
          <label>Protokolldateipfad:</label>
          <defaultValue>%systemroot%\system32\LogFiles\Firewall\pfirewall.log</defaultValue>
        </textBox>
      </presentation>
      <presentation id="LogFileSizeDomain">
        <decimalTextBox refId="LogFileSize" defaultValue="4096" label="Maximale Größe (KB):" />
      </presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>
ADML_EOF

# GroupPolicy.admx
cat > "$POLICY_DEFS/GroupPolicy.admx" << 'ADMX_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="GP" namespace="Microsoft.Policies.GroupPolicy" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="GroupPolicy" displayName="$(string.GroupPolicy)">
      <parentCategory ref="GP:System" />
    </category>
    <category name="RegistryPolicyProcessing" displayName="$(string.RegistryPolicyProcessing)">
      <parentCategory ref="GP:GroupPolicy" />
    </category>
    <category name="Scripts" displayName="$(string.Scripts)">
      <parentCategory ref="GP:GroupPolicy" />
    </category>
    <category name="SecuritySettings" displayName="$(string.SecuritySettings)">
      <parentCategory ref="GP:System" />
    </category>
  </categories>
  <policies>
    <policy name="NoBackgroundPolicy" class="Machine" displayName="$(string.NoBackgroundPolicy)" 
            explainText="$(string.NoBackgroundPolicy_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\Group Policy\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}" valueName="NoBackgroundPolicy">
      <parentCategory ref="GP:RegistryPolicyProcessing" />
      <supportedOn ref="GP:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="0" /></enabledValue>
      <disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="NoGPOListChanges" class="Machine" displayName="$(string.NoGPOListChanges)" 
            explainText="$(string.NoGPOListChanges_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\Group Policy\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}" valueName="NoGPOListChanges">
      <parentCategory ref="GP:RegistryPolicyProcessing" />
      <supportedOn ref="GP:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableBkGndGroupPolicy" class="User" displayName="$(string.DisableBkGndGroupPolicy)" 
            explainText="$(string.DisableBkGndGroupPolicy_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\Group Policy\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}" valueName="DisableBkGndGroupPolicy">
      <parentCategory ref="GP:RegistryPolicyProcessing" />
      <supportedOn ref="GP:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="MaxGPOProcessingTime" class="Machine" displayName="$(string.MaxGPOProcessingTime)" 
            explainText="$(string.MaxGPOProcessingTime_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\Group Policy\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}" valueName="MaxGPOProcessingTime">
      <parentCategory ref="GP:RegistryPolicyProcessing" />
      <supportedOn ref="GP:SUPPORTED_WindowsVista" />
      <elements>
        <decimal id="MaxGPOProcessingTime" valueName="MaxGPOProcessingTime" minValue="0" maxValue="99999" />
      </elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsVista" displayName="$(string.SUPPORTED_WindowsVista)" />
    </definitions>
  </supportedOn>
</policyDefinitions>
ADMX_EOF

# GroupPolicy.adml
cat > "$POLICY_DEFS/en-US/GroupPolicy.adml" << 'ADML_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                           revision="1.0" schemaVersion="1.0">
  <displayName>Group Policy Administrative Templates</displayName>
  <description>Administrative Vorlagen für Gruppenrichtlinien</description>
  <resources>
    <stringTable>
      <string id="System">System</string>
      <string id="GroupPolicy">Gruppenrichtlinie</string>
      <string id="RegistryPolicyProcessing">Registrierungsrichtlinienverarbeitung</string>
      <string id="Scripts">Skripts</string>
      <string id="SecuritySettings">Sicherheitseinstellungen</string>
      <string id="NoBackgroundPolicy">Hintergrundverarbeitung von Richtlinien</string>
      <string id="NoBackgroundPolicy_Help">Legt fest, ob Richtlinien im Hintergrund verarbeitet werden.</string>
      <string id="NoGPOListChanges">GPO-Listenänderungen ignorieren</string>
      <string id="NoGPOListChanges_Help">Legt fest, ob Änderungen an der GPO-Liste ignoriert werden.</string>
      <string id="DisableBkGndGroupPolicy">Hintergrundverarbeitung deaktivieren (Benutzer)</string>
      <string id="DisableBkGndGroupPolicy_Help">Deaktiviert die Hintergrundverarbeitung von Gruppenrichtlinien für Benutzer.</string>
      <string id="MaxGPOProcessingTime">Maximale Verarbeitungszeit</string>
      <string id="MaxGPOProcessingTime_Help">Legt die maximale Zeit für die GPO-Verarbeitung in Sekunden fest.</string>
      <string id="SUPPORTED_WindowsVista">Mindestens Windows Vista</string>
    </stringTable>
    <presentationTable>
      <presentation id="MaxGPOProcessingTime">
        <decimalTextBox refId="MaxGPOProcessingTime" defaultValue="60" label="Maximale Verarbeitungszeit (Sekunden):" />
      </presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>
ADML_EOF

# WindowsRemoteManagement.admx
cat > "$POLICY_DEFS/WindowsRemoteManagement.admx" << 'ADMX_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="WinRM" namespace="Microsoft.Policies.WindowsRemoteManagement" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="WindowsRemoteManagement" displayName="$(string.WindowsRemoteManagement)">
      <parentCategory ref="WinRM:WindowsComponents" />
    </category>
    <category name="WinRMService" displayName="$(string.WinRMService)">
      <parentCategory ref="WinRM:WindowsRemoteManagement" />
    </category>
    <category name="WinRMClient" displayName="$(string.WinRMClient)">
      <parentCategory ref="WinRM:WindowsRemoteManagement" />
    </category>
  </categories>
  <policies>
    <policy name="AllowAutoConfig" class="Both" displayName="$(string.AllowAutoConfig)" 
            explainText="$(string.AllowAutoConfig_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Service" valueName="AllowAutoConfig">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
      <elements>
        <text id="IPv4Filter" valueName="IPv4Filter" />
        <text id="IPv6Filter" valueName="IPv6Filter" />
      </elements>
    </policy>
    <policy name="AllowBasic" class="Both" displayName="$(string.AllowBasic)" 
            explainText="$(string.AllowBasic_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Service" valueName="AllowBasic">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="AllowUnencryptedTraffic" class="Both" displayName="$(string.AllowUnencryptedTraffic)" 
            explainText="$(string.AllowUnencryptedTraffic_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Service" valueName="AllowUnencryptedTraffic">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="AllowRemoteShellAccess" class="Machine" displayName="$(string.AllowRemoteShellAccess)" 
            explainText="$(string.AllowRemoteShellAccess_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Service\WinRS" valueName="AllowRemoteShellAccess">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_Windows7" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="MaxConcurrentUsers" class="Machine" displayName="$(string.MaxConcurrentUsers)" 
            explainText="$(string.MaxConcurrentUsers_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Service\WinRS" valueName="MaxConcurrentUsers">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_Windows7" />
      <elements>
        <decimal id="MaxConcurrentUsers" valueName="MaxConcurrentUsers" minValue="1" maxValue="100" />
      </elements>
    </policy>
    <policy name="MaxShellsPerUser" class="Machine" displayName="$(string.MaxShellsPerUser)" 
            explainText="$(string.MaxShellsPerUser_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Service\WinRS" valueName="MaxShellsPerUser">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_Windows7" />
      <elements>
        <decimal id="MaxShellsPerUser" valueName="MaxShellsPerUser" minValue="1" maxValue="100" />
      </elements>
    </policy>
    <policy name="ClientAllowBasic" class="Both" displayName="$(string.ClientAllowBasic)" 
            explainText="$(string.ClientAllowBasic_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Client" valueName="AllowBasic">
      <parentCategory ref="WinRM:WinRMClient" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="ClientAllowUnencryptedTraffic" class="Both" displayName="$(string.ClientAllowUnencryptedTraffic)" 
            explainText="$(string.ClientAllowUnencryptedTraffic_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Client" valueName="AllowUnencryptedTraffic">
      <parentCategory ref="WinRM:WinRMClient" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="TrustedHosts" class="Both" displayName="$(string.TrustedHosts)" 
            explainText="$(string.TrustedHosts_Help)" 
            key="SOFTWARE\Policies\Microsoft\Windows\WinRM\Client" valueName="TrustedHosts">
      <parentCategory ref="WinRM:WinRMClient" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <elements>
        <text id="TrustedHosts" valueName="TrustedHosts" />
      </elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsVista" displayName="$(string.SUPPORTED_WindowsVista)" />
      <definition name="SUPPORTED_Windows7" displayName="$(string.SUPPORTED_Windows7)" />
    </definitions>
  </supportedOn>
</policyDefinitions>
ADMX_EOF

# WindowsRemoteManagement.adml
cat > "$POLICY_DEFS/en-US/WindowsRemoteManagement.adml" << 'ADML_EOF'
<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                           revision="1.0" schemaVersion="1.0">
  <displayName>Windows Remote Management Administrative Templates</displayName>
  <description>Administrative Vorlagen für Windows-Remoteverwaltung</description>
  <resources>
    <stringTable>
      <string id="WindowsComponents">Windows-Komponenten</string>
      <string id="WindowsRemoteManagement">Windows-Remoteverwaltung</string>
      <string id="WinRMService">WinRM-Dienst</string>
      <string id="WinRMClient">WinRM-Client</string>
      <string id="AllowAutoConfig">Remoteserververwaltung zulassen</string>
      <string id="AllowAutoConfig_Help">Ermöglicht die Fernverwaltung über WinRM.</string>
      <string id="AllowBasic">Basic-Authentifizierung zulassen</string>
      <string id="AllowBasic_Help">Erlaubt die Basic-Authentifizierung für WinRM.</string>
      <string id="AllowUnencryptedTraffic">Unverschlüsselten Datenverkehr zulassen</string>
      <string id="AllowUnencryptedTraffic_Help">Erlaubt unverschlüsselten WinRM-Datenverkehr.</string>
      <string id="AllowRemoteShellAccess">Remote-Shell-Zugriff zulassen</string>
      <string id="AllowRemoteShellAccess_Help">Erlaubt den Zugriff auf die Remote-Shell (WinRS).</string>
      <string id="MaxConcurrentUsers">Maximale gleichzeitige Benutzer</string>
      <string id="MaxConcurrentUsers_Help">Legt die maximale Anzahl gleichzeitiger Benutzer für WinRS fest.</string>
      <string id="MaxShellsPerUser">Maximale Shells pro Benutzer</string>
      <string id="MaxShellsPerUser_Help">Legt die maximale Anzahl von Shells pro Benutzer fest.</string>
      <string id="ClientAllowBasic">Basic-Authentifizierung zulassen (Client)</string>
      <string id="ClientAllowBasic_Help">Erlaubt die Basic-Authentifizierung für den WinRM-Client.</string>
      <string id="ClientAllowUnencryptedTraffic">Unverschlüsselten Datenverkehr zulassen (Client)</string>
      <string id="ClientAllowUnencryptedTraffic_Help">Erlaubt unverschlüsselten Datenverkehr für den WinRM-Client.</string>
      <string id="TrustedHosts">Vertrauenswürdige Hosts</string>
      <string id="TrustedHosts_Help">Legt die Liste der vertrauenswürdigen Hosts für den WinRM-Client fest.</string>
      <string id="SUPPORTED_WindowsVista">Mindestens Windows Vista</string>
      <string id="SUPPORTED_Windows7">Mindestens Windows 7</string>
    </stringTable>
    <presentationTable>
      <presentation id="AllowAutoConfig">
        <checkBox refId="AllowAutoConfig" defaultChecked="true">Remoteserververwaltung aktivieren</checkBox>
        <textBox refId="IPv4Filter">
          <label>IPv4-Filter:</label>
          <defaultValue>*</defaultValue>
        </textBox>
        <textBox refId="IPv6Filter">
          <label>IPv6-Filter:</label>
          <defaultValue>*</defaultValue>
        </textBox>
      </presentation>
      <presentation id="MaxConcurrentUsers">
        <decimalTextBox refId="MaxConcurrentUsers" defaultValue="5" label="Maximale Benutzer:" />
      </presentation>
      <presentation id="MaxShellsPerUser">
        <decimalTextBox refId="MaxShellsPerUser" defaultValue="5" label="Maximale Shells:" />
      </presentation>
      <presentation id="TrustedHosts">
        <textBox refId="TrustedHosts">
          <label>Vertrauenswürdige Hosts (kommagetrennt):</label>
        </textBox>
      </presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>
ADML_EOF

# Set permissions
chown -R "BUILTIN\administrators":"BUILTIN\administrators" "$POLICY_DEFS"
chmod -R 775 "$POLICY_DEFS"

echo "ADMX PolicyDefinitions initialized successfully!"
echo "Created:"
ls -la "$POLICY_DEFS"/*.admx
ls -la "$POLICY_DEFS/en-US"/*.adml
