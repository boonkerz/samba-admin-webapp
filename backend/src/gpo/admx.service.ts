import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const SYSVOL_BASE = "/var/lib/samba/sysvol";
const POLICY_DEFINITIONS_DIR = "PolicyDefinitions";

// Cache for ADMX definitions (parsed once, reused across requests)
let admxCache: {
  definitions: AdmxDefinitions;
  timestamp: number;
  domainDn: string;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

interface AdmxPolicy {
  name: string;
  class: "User" | "Machine" | "Both";
  displayName: string;
  explainText?: string;
  key: string;
  valueName: string;
  presentation?: string;
  elements?: AdmxElement[];
  parentCategory?: string;
  supportedOn?: string;
  /**
   * The literal value ADMX says to write to `key`/`valueName` for the
   * Enabled/Disabled radio state, from the policy's own `<enabledValue>` /
   * `<disabledValue>` tags. Most real Windows policies define these
   * explicitly (often, but not always, 1/0) rather than leaving it to be
   * inferred — without parsing them, there's no way to know what "Enabled"
   * or "Disabled" should actually write for a plain on/off policy.
   */
  enabledValue?: string | number;
  disabledValue?: string | number;
}

interface AdmxElement {
  id: string;
  type: "boolean" | "decimal" | "longDecimal" | "text" | "multiText" | "enum" | "list";
  label?: string;
  valueName?: string;
  minValue?: number;
  maxValue?: number;
  default?: unknown;
  items?: { displayName: string; value: unknown }[];
  /** Registry key a `list` element's items are written under (list elements have no valueName of their own). */
  key?: string;
  /**
   * Per the ADMX schema, a `list` element defaults to `explicitValue="false"`:
   * each item is written as its own registry value with **both the value
   * name and the data set to the item text** (e.g. approved server
   * "printsrv01" becomes valueName="printsrv01", value="printsrv01"). Only
   * when a policy explicitly sets `explicitValue="true"` do items instead
   * get sequential numeric value names ("1", "2", ...) with the item text as
   * the data. Getting this backwards means Registry.pol entries a real
   * Windows client (or gpedit/GPMC) doesn't recognize as configured at all.
   */
  explicitValue?: boolean;
}

interface AdmxCategory {
  name: string;
  displayName: string;
  parentCategory?: string;
  children: AdmxCategory[];
  policies: AdmxPolicy[];
  /**
   * Whether this category (or any descendant, recursively) has at least one
   * Machine/Both-class or User/Both-class policy. Real GPME hides a whole
   * category from a config side (Computer/User) if nothing in its subtree
   * applies there — e.g. the top-level "Printers" ADMX category has 45
   * policies that are all Machine-class, so real GPME shows it only under
   * Computerkonfiguration, never under Benutzerkonfiguration, even though
   * the category itself is scope-agnostic in the schema. Computed once
   * after the full category/policy graph is built (see computeScopeFlags),
   * not baked in per-parse-path, so it's correct whether definitions came
   * from the JSON cache or a live ADMX parse.
   */
  hasMachinePolicy?: boolean;
  hasUserPolicy?: boolean;
}

/**
 * Recursively computes, for one category, whether it or any descendant has
 * a policy applicable to the Machine and/or User config side. Memoized
 * across the whole call because the same category can be reached from
 * multiple callers (once per traversal root) and category graphs can be
 * deep — without memoization this is exponential in tree depth.
 */
function computeScopeFlags(
  category: AdmxCategory,
  memo: Map<string, { machine: boolean; user: boolean }>
): { machine: boolean; user: boolean } {
  const cached = memo.get(category.name);
  if (cached) return cached;

  // Set a provisional entry before recursing, as a cheap guard against the
  // ADMX graph somehow containing a cycle (shouldn't happen, but a stack
  // overflow here would take down the whole request rather than just this
  // one category's flags).
  const provisional = { machine: false, user: false };
  memo.set(category.name, provisional);

  let machine = category.policies.some((p) => p.class === "Machine" || p.class === "Both");
  let user = category.policies.some((p) => p.class === "User" || p.class === "Both");

  for (const child of category.children) {
    const childFlags = computeScopeFlags(child, memo);
    machine = machine || childFlags.machine;
    user = user || childFlags.user;
  }

  const result = { machine, user };
  memo.set(category.name, result);
  return result;
}

interface AdmxDefinitions {
  categories: Map<string, AdmxCategory>;
  policies: AdmxPolicy[];
  supportedProducts: Map<string, { displayName: string; majorVersion: number; minorVersion: number }>;
}

/**
 * Simple XML parser for ADMX files (no external dependencies)
 */
function parseXml(xml: string): Record<string, unknown> {
  // Simple recursive descent parser for XML
  const result: Record<string, unknown> = {};
  let pos = 0;

  function parseElement(): Record<string, unknown> {
    const element: Record<string, unknown> = {};
    const attrs: Record<string, string> = {};

    // Skip whitespace
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;

    // Read tag name
    if (xml[pos] !== "<") return element;
    pos++; // skip <
    let tagName = "";
    while (pos < xml.length && /[a-zA-Z0-9_-]/.test(xml[pos])) {
      tagName += xml[pos++];
    }
    element["_tag"] = tagName;

    // Read attributes
    while (pos < xml.length && xml[pos] !== ">" && xml[pos] !== "/") {
      while (pos < xml.length && /\s/.test(xml[pos])) pos++;
      let attrName = "";
      while (pos < xml.length && /[a-zA-Z0-9_-]/.test(xml[pos])) {
        attrName += xml[pos++];
      }
      if (xml[pos] === "=") {
        pos++; // skip =
        let attrValue = "";
        const quote = xml[pos++];
        while (pos < xml.length && xml[pos] !== quote) {
          attrValue += xml[pos++];
        }
        pos++; // skip closing quote
        attrs[attrName] = attrValue;
      }
    }
    element["_attrs"] = attrs;

    // Check for self-closing tag
    if (xml[pos] === "/") {
      pos++; // skip /
      pos++; // skip >
      return element;
    }
    pos++; // skip >

    // Read children and text
    let text = "";
    const children: Record<string, unknown>[] = [];

    while (pos < xml.length) {
      if (xml[pos] === "<") {
        if (xml[pos + 1] === "/") {
          // Closing tag
          pos += 2;
          while (pos < xml.length && xml[pos] !== ">") pos++;
          pos++; // skip >
          break;
        } else {
          // Child element
          if (text.trim()) {
            children.push({ "_tag": "_text", "_text": text.trim() });
            text = "";
          }
          children.push(parseElement());
        }
      } else {
        text += xml[pos++];
      }
    }

    if (text.trim()) {
      children.push({ "_tag": "_text", "_text": text.trim() });
    }

    if (children.length > 0) {
      element["_children"] = children;
    }

    return element;
  }

  // Skip XML declaration
  if (xml.startsWith("<?")) {
    while (pos < xml.length && xml[pos - 1] !== ">") pos++;
  }

  return parseElement();
}

function getElementText(element: Record<string, unknown>, tagName: string): string | undefined {
  const children = element["_children"] as Record<string, unknown>[] | undefined;
  if (!children) return undefined;
  const child = children.find((c) => c["_tag"] === tagName);
  if (!child) return undefined;
  const textChild = (child["_children"] as Record<string, unknown>[])?.find((c) => c["_tag"] === "_text");
  return textChild?.["_text"] as string | undefined;
}

function getChildElements(element: Record<string, unknown>, tagName: string): Record<string, unknown>[] {
  const children = element["_children"] as Record<string, unknown>[] | undefined;
  if (!children) return [];
  return children.filter((c) => c["_tag"] === tagName);
}

function getAttr(element: Record<string, unknown>, name: string): string | undefined {
  const attrs = element["_attrs"] as Record<string, string> | undefined;
  return attrs?.[name];
}

/**
 * Reads an ADMX file, auto-detecting its encoding from a BOM (mirrors
 * packaging/build-admx-cache.py's read_text_auto). Microsoft's own templates
 * are plain UTF-8, but third-party bundles aren't guaranteed to be — Google's
 * official Chrome ADMX/ADML files, for example, ship as UTF-16LE with a BOM.
 * Blindly reading as UTF-8 doesn't throw on such a file: every ASCII
 * character decodes as itself followed by a stray NUL codepoint, so this
 * file's own regex-free parseXml would still "succeed" while silently
 * finding zero categories/policies.
 */
async function readAdmxFileAuto(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le", 2);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8", 3);
  }
  return buf.toString("utf8");
}

/** Reads the <decimal value="N"/> or <string>text</string> payload wrapped inside a <valueTag> element (used for both enum <item><value>...</value></item> and policy-level <enabledValue>/<disabledValue>). */
function getWrappedValue(element: Record<string, unknown>): string | number | undefined {
  const decimalChild = getChildElements(element, "decimal")[0];
  if (decimalChild) {
    const v = getAttr(decimalChild, "value");
    return v !== undefined ? Number(v) : undefined;
  }
  const stringChild = getChildElements(element, "string")[0];
  if (stringChild) return getElementText(stringChild, "_text") ?? "";
  return undefined;
}

/**
 * Parse an ADMX file and extract policy definitions
 */
function parseAdmx(content: string, admlContent?: string): { categories: AdmxCategory[]; policies: AdmxPolicy[] } {
  const root = parseXml(content);
  const categories: AdmxCategory[] = [];
  const policies: AdmxPolicy[] = [];

  // Parse categories
  const categoriesElement = getChildElements(root, "categories")[0];
  if (categoriesElement) {
    for (const catElement of getChildElements(categoriesElement, "category")) {
      const category: AdmxCategory = {
        name: getAttr(catElement, "name") ?? "",
        displayName: getAttr(catElement, "displayName") ?? "",
        parentCategory: getAttr(catElement, "parentCategory"),
        children: [],
        policies: [],
      };

      // Parse child categories
      for (const childCat of getChildElements(catElement, "parentCategory")) {
        // This is a reference, not a child
      }

      categories.push(category);
    }
  }

  // Parse policies
  const policiesElement = getChildElements(root, "policies")[0];
  if (policiesElement) {
    for (const policyElement of getChildElements(policiesElement, "policy")) {
      const policy: AdmxPolicy = {
        name: getAttr(policyElement, "name") ?? "",
        class: (getAttr(policyElement, "class") as "User" | "Machine" | "Both") ?? "Both",
        displayName: getAttr(policyElement, "displayName") ?? "",
        key: "",
        valueName: "",
        parentCategory: getAttr(policyElement, "parentCategory"),
        supportedOn: getAttr(policyElement, "supportedOn"),
      };

      // Parse elements (settings)
      const elementsElement = getChildElements(policyElement, "elements")[0];
      if (elementsElement) {
        policy.elements = [];
        for (const element of getChildElements(elementsElement, "")) {
          const elementType = getAttr(element, "_tag") as string;
          const admxElement: AdmxElement = {
            id: getAttr(element, "id") ?? "",
            type: elementType as AdmxElement["type"],
            valueName: getAttr(element, "valueName"),
          };

          // Parse based on type
          if (elementType === "boolean") {
            const trueChild = getChildElements(element, "trueValue")[0];
            const falseChild = getChildElements(element, "falseValue")[0];
            if (trueChild) {
              const valueElement = getChildElements(trueChild, "decimal")[0] ?? getChildElements(trueChild, "string")[0];
              if (valueElement) {
                admxElement.default = getAttr(valueElement, "value") ?? getElementText(valueElement, "_text");
              }
            }
          } else if (elementType === "decimal") {
            admxElement.minValue = parseInt(getAttr(element, "minValue") ?? "0");
            admxElement.maxValue = parseInt(getAttr(element, "maxValue") ?? "9999");
            admxElement.default = parseInt(getAttr(element, "value") ?? "0");
          } else if (elementType === "text") {
            admxElement.label = getAttr(element, "label");
          } else if (elementType === "enum") {
            admxElement.items = [];
            for (const item of getChildElements(element, "item")) {
              const valueWrapper = getChildElements(item, "value")[0];
              admxElement.items.push({
                displayName: getAttr(item, "displayName") ?? "",
                value: valueWrapper ? getWrappedValue(valueWrapper) : undefined,
              });
            }
          } else if (elementType === "list") {
            // `list` elements have no valueName of their own — only a
            // separate registry key their items get written under.
            admxElement.key = getAttr(element, "key");
            admxElement.explicitValue = getAttr(element, "explicitValue") === "true";
          }

          policy.elements.push(admxElement);
        }
      }

      // Get key and valueName from policy element
      policy.key = getAttr(policyElement, "key") ?? "";
      policy.valueName = getAttr(policyElement, "valueName") ?? "";

      // Parse explainText (description)
      policy.explainText = getAttr(policyElement, "explainText");

      // Parse <enabledValue>/<disabledValue> — the actual value to write for
      // the Enabled/Disabled radio state (see AdmxPolicy field docs above).
      const enabledValueWrapper = getChildElements(policyElement, "enabledValue")[0];
      if (enabledValueWrapper) policy.enabledValue = getWrappedValue(enabledValueWrapper);
      const disabledValueWrapper = getChildElements(policyElement, "disabledValue")[0];
      if (disabledValueWrapper) policy.disabledValue = getWrappedValue(disabledValueWrapper);

      policies.push(policy);
    }
  }

  return { categories, policies };
}

/**
 * Load ADMX definitions from PolicyDefinitions directory (with caching)
 */
export async function loadAdmxDefinitions(domainDn: string): Promise<AdmxDefinitions> {
  // Check memory cache
  const now = Date.now();
  if (admxCache && admxCache.domainDn === domainDn && (now - admxCache.timestamp) < CACHE_TTL) {
    return admxCache.definitions;
  }

  const domainParts = domainDn.split(",").filter((p) => p.startsWith("DC="));
  const domainName = domainParts.map((p) => p.replace("DC=", "")).join(".");
  const policyDefsPath = path.join(SYSVOL_BASE, domainName, POLICY_DEFINITIONS_DIR);

  const definitions: AdmxDefinitions = {
    categories: new Map(),
    policies: [],
    supportedProducts: new Map(),
  };

  try {
    // Try to load from JSON cache first (fast path)
    const cacheFile = path.join(policyDefsPath, "admx-cache.json");
    try {
      const cacheData = await fs.readFile(cacheFile, "utf-8");
      const cached = JSON.parse(cacheData);
      
      // Convert cached data to AdmxDefinitions format
      for (const cat of cached.categories) {
        const category: AdmxCategory = {
          name: cat.name,
          displayName: cat.displayName,
          parentCategory: cat.parentCategory,
          children: [],
          policies: [],
        };
        definitions.categories.set(cat.name, category);
      }
      
      for (const pol of cached.policies) {
        const policy: AdmxPolicy = {
          name: pol.name,
          class: pol.class,
          displayName: pol.displayName,
          explainText: pol.explainText,
          key: pol.key,
          valueName: pol.valueName,
          parentCategory: pol.parentCategory,
          elements: pol.elements || [],
          enabledValue: pol.enabledValue ?? undefined,
          disabledValue: pol.disabledValue ?? undefined,
        };
        definitions.policies.push(policy);
      }
      
      // Build parent-child relationships
      for (const [name, category] of definitions.categories) {
        if (category.parentCategory) {
          const parentName = category.parentCategory.split(":").pop();
          const parent = definitions.categories.get(parentName ?? "");
          if (parent) {
            parent.children.push(category);
          }
        }
      }
      
      // Assign policies to categories
      for (const policy of definitions.policies) {
        if (policy.parentCategory) {
          const categoryName = policy.parentCategory.split(":").pop();
          const category = definitions.categories.get(categoryName ?? "");
          if (category) {
            category.policies.push(policy);
          }
        }
      }
      
      console.log(`Loaded ADMX cache: ${definitions.categories.size} categories, ${definitions.policies.length} policies`);
    } catch (cacheErr) {
      // Cache file doesn't exist or is invalid, parse ADMX files
      console.log("No ADMX cache found, parsing files...");
      
      await fs.access(policyDefsPath);
      const files = await fs.readdir(policyDefsPath);
      const admxFiles = files.filter((f) => f.endsWith(".admx"));

      // Parse files in parallel
      const parsePromises = admxFiles.map(async (admxFile) => {
        try {
          const admxPath = path.join(policyDefsPath, admxFile);
          const content = await readAdmxFileAuto(admxPath);
          return parseAdmx(content);
        } catch (err) {
          return { categories: [], policies: [] };
        }
      });

      const results = await Promise.all(parsePromises);

      for (const { categories, policies } of results) {
        for (const category of categories) {
          if (!definitions.categories.has(category.name)) {
            definitions.categories.set(category.name, category);
          }
        }
        definitions.policies.push(...policies);
      }

      for (const [name, category] of definitions.categories) {
        if (category.parentCategory) {
          const parentName = category.parentCategory.split(":").pop();
          const parent = definitions.categories.get(parentName ?? "");
          if (parent) {
            parent.children.push(category);
          }
        }
      }

      for (const policy of definitions.policies) {
        if (policy.parentCategory) {
          const categoryName = policy.parentCategory.split(":").pop();
          const category = definitions.categories.get(categoryName ?? "");
          if (category) {
            category.policies.push(policy);
          }
        }
      }
    }

    // Populate hasMachinePolicy/hasUserPolicy on every category, regardless
    // of which branch above built `definitions` (cache hit or live parse).
    const scopeMemo = new Map<string, { machine: boolean; user: boolean }>();
    for (const category of definitions.categories.values()) {
      const flags = computeScopeFlags(category, scopeMemo);
      category.hasMachinePolicy = flags.machine;
      category.hasUserPolicy = flags.user;
    }

    // Update memory cache
    admxCache = {
      definitions,
      timestamp: now,
      domainDn,
    };
  } catch (err) {
    console.error("Error loading ADMX definitions:", err);
  }

  return definitions;
}

/**
 * Clear the ADMX cache (call when files change)
 */
export function clearAdmxCache(): void {
  admxCache = null;
}

/**
 * Get the PolicyDefinitions path for a domain
 */
export function getPolicyDefinitionsPath(domainDn: string): string {
  const domainParts = domainDn.split(",").filter((p) => p.startsWith("DC="));
  const domainName = domainParts.map((p) => p.replace("DC=", "")).join(".");
  return path.join(SYSVOL_BASE, domainName, POLICY_DEFINITIONS_DIR);
}

/**
 * Create PolicyDefinitions directory with common ADMX templates
 */
export async function initializePolicyDefinitions(domainDn: string): Promise<void> {
  const policyDefsPath = getPolicyDefinitionsPath(domainDn);
  const enUsPath = path.join(policyDefsPath, "en-US");

  // Create directories
  await fs.mkdir(policyDefsPath, { recursive: true });
  await fs.mkdir(enUsPath, { recursive: true });

  // Create Windows.admx (common Windows settings)
  const windowsAdmx = `<?xml version="1.0" encoding="utf-8"?>
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
    <category name="WindowsComponents" displayName="Windows-Komponenten">
      <parentCategory ref="windows:Windows" />
    </category>
    <category name="WindowsUpdate" displayName="Windows Update">
      <parentCategory ref="windows:WindowsComponents" />
    </category>
    <category name="System" displayName="System">
      <parentCategory ref="windows:Windows" />
    </category>
    <category name="Logon" displayName="Anmeldung">
      <parentCategory ref="windows:System" />
    </category>
    <category name="Network" displayName="Netzwerk">
      <parentCategory ref="windows:Windows" />
    </category>
    <category name="Firewall" displayName="Windows-Firewall">
      <parentCategory ref="windows:Network" />
    </category>
  </categories>
  <policies>
    <policy name="NoAutoUpdate" class="Machine" displayName="Automatische Updates konfigurieren" 
            explainText="Legt fest, ob automatische Updates aktiviert sind." key="SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU" valueName="NoAutoUpdate">
      <parentCategory ref="windows:WindowsUpdate" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="0" /></enabledValue>
      <disabledValue><decimal value="1" /></disabledValue>
      <elements>
        <decimal id="NoAutoUpdate" valueName="NoAutoUpdate" minValue="0" maxValue="4" />
      </elements>
    </policy>
    <policy name="RebootRelaunchTimeoutEnabled" class="Machine" displayName="Benachrichtigung für geplante Neustarts" 
            explainText="Legt fest, ob Benutzer über geplante Neustarts benachrichtigt werden." 
            key="SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU" valueName="RebootRelaunchTimeoutEnabled">
      <parentCategory ref="windows:WindowsUpdate" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="LegalNoticeCaption" class="Machine" displayName="Anmeldehinweis anzeigen" 
            explainText="Zeigt einen Hinweis vor der Anmeldung an." 
            key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" valueName="legalnoticecaption">
      <parentCategory ref="windows:Logon" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <elements>
        <text id="LegalNoticeCaption" valueName="legalnoticecaption" />
      </elements>
    </policy>
    <policy name="EnableFirewall" class="Machine" displayName="Windows-Firewall aktivieren" 
            explainText="Aktiviert die Windows-Firewall für Domänenprofile." 
            key="SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile" valueName="EnableFirewall">
      <parentCategory ref="windows:Firewall" />
      <supportedOn ref="windows:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DisableNotifications" class="User" displayName="Benachrichtigungen deaktivieren" 
            explainText="Deaktiviert Toast-Benachrichtigungen." 
            key="SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PushNotifications" valueName="NoToastApplicationNotification">
      <parentCategory ref="windows:System" />
      <supportedOn ref="windows:SUPPORTED_Windows8" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="Mindestens Windows XP" />
      <definition name="SUPPORTED_Windows8" displayName="Mindestens Windows 8" />
    </definitions>
  </supportedOn>
</policyDefinitions>`;

  const windowsAdml = `<?xml version="1.0" encoding="utf-8"?>
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
      <string id="RebootRelaunchTimeoutEnabled">Benachrichtigung für geplante Neustarts</string>
      <string id="LegalNoticeCaption">Anmeldehinweis anzeigen</string>
      <string id="EnableFirewall">Windows-Firewall aktivieren</string>
      <string id="DisableNotifications">Benachrichtigungen deaktivieren</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
      <string id="SUPPORTED_Windows8">Mindestens Windows 8</string>
    </stringTable>
    <presentationTable>
      <presentation id="NoAutoUpdate">
        <decimalTextBox refId="NoAutoUpdate" defaultValue="0" label="Automatische Updates (0=aktiv, 1=deaktiviert):" />
      </presentation>
      <presentation id="LegalNoticeCaption">
        <textBox refId="LegalNoticeCaption">
          <label>Anmeldehinweis:</label>
        </textBox>
      </presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>`;

  await fs.writeFile(path.join(policyDefsPath, "windows.admx"), windowsAdmx);
  await fs.writeFile(path.join(enUsPath, "windows.adml"), windowsAdml);

  // Create WindowsFirewall.admx
  const firewallAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="Firewall" namespace="Microsoft.Policies.WindowsFirewall" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="WindowsFirewall" displayName="Windows-Firewall">
      <parentCategory ref="Firewall:Network" />
    </category>
    <category name="DomainProfile" displayName="Domänenprofil">
      <parentCategory ref="Firewall:WindowsFirewall" />
    </category>
    <category name="StandardProfile" displayName="Standardprofil">
      <parentCategory ref="Firewall:WindowsFirewall" />
    </category>
  </categories>
  <policies>
    <policy name="EnableFirewallDomain" class="Machine" displayName="Firewall aktivieren (Domäne)" 
            explainText="Aktiviert die Windows-Firewall für das Domänenprofil." 
            key="SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile" valueName="EnableFirewall">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="EnableFirewallStandard" class="Machine" displayName="Firewall aktivieren (Standard)" 
            explainText="Aktiviert die Windows-Firewall für das Standardprofil." 
            key="SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\StandardProfile" valueName="EnableFirewall">
      <parentCategory ref="Firewall:StandardProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
    <policy name="DefaultInboundActionDomain" class="Machine" displayName="Standardaktion für eingehenden Datenverkehr (Domäne)" 
            explainText="Legt die Standardaktion für eingehenden Datenverkehr im Domänenprofil fest." 
            key="SOFTWARE\\Policies\\Microsoft\\WindowsFirewall\\DomainProfile" valueName="DefaultInboundAction">
      <parentCategory ref="Firewall:DomainProfile" />
      <supportedOn ref="Firewall:SUPPORTED_WindowsXP" />
      <elements>
        <enum id="DefaultInboundAction" valueName="DefaultInboundAction">
          <item displayName="Blockieren"><value><decimal value="1" /></value></item>
          <item displayName="Zulassen"><value><decimal value="0" /></value></item>
        </enum>
      </elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsXP" displayName="Mindestens Windows XP" />
    </definitions>
  </supportedOn>
</policyDefinitions>`;

  const firewallAdml = `<?xml version="1.0" encoding="utf-8"?>
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
      <string id="EnableFirewallDomain">Firewall aktivieren (Domäne)</string>
      <string id="EnableFirewallStandard">Firewall aktivieren (Standard)</string>
      <string id="DefaultInboundActionDomain">Standardaktion für eingehenden Datenverkehr (Domäne)</string>
      <string id="SUPPORTED_WindowsXP">Mindestens Windows XP</string>
    </stringTable>
    <presentationTable>
      <presentation id="DefaultInboundActionDomain">
        <dropdownList refId="DefaultInboundAction" defaultItem="0" />
      </presentation>
    </presentationTable>
  </resources>
</policyDefinitionResources>`;

  await fs.writeFile(path.join(policyDefsPath, "WindowsFirewall.admx"), firewallAdmx);
  await fs.writeFile(path.join(enUsPath, "WindowsFirewall.adml"), firewallAdml);

  // Create WindowsRemoteManagement.admx
  const winrmAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="WinRM" namespace="Microsoft.Policies.WindowsRemoteManagement" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="WindowsRemoteManagement" displayName="Windows-Remoteverwaltung">
      <parentCategory ref="WinRM:WindowsComponents" />
    </category>
    <category name="WinRMService" displayName="WinRM-Dienst">
      <parentCategory ref="WinRM:WindowsRemoteManagement" />
    </category>
  </categories>
  <policies>
    <policy name="AllowAutoConfig" class="Both" displayName="Remoteserververwaltung zulassen" 
            explainText="Ermöglicht die Fernverwaltung über WinRM." 
            key="SOFTWARE\\Policies\\Microsoft\\Windows\\WinRM\\Service" valueName="AllowAutoConfig">
      <parentCategory ref="WinRM:WinRMService" />
      <supportedOn ref="WinRM:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
      <elements>
        <text id="IPv4Filter" valueName="IPv4Filter" />
        <text id="IPv6Filter" valueName="IPv6Filter" />
      </elements>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsVista" displayName="Mindestens Windows Vista" />
    </definitions>
  </supportedOn>
</policyDefinitions>`;

  const winrmAdml = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                           revision="1.0" schemaVersion="1.0">
  <displayName>Windows Remote Management Administrative Templates</displayName>
  <description>Administrative Vorlagen für Windows-Remoteverwaltung</description>
  <resources>
    <stringTable>
      <string id="WindowsComponents">Windows-Komponenten</string>
      <string id="WindowsRemoteManagement">Windows-Remoteverwaltung</string>
      <string id="WinRMService">WinRM-Dienst</string>
      <string id="AllowAutoConfig">Remoteserververwaltung zulassen</string>
      <string id="SUPPORTED_WindowsVista">Mindestens Windows Vista</string>
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
    </presentationTable>
  </resources>
</policyDefinitionResources>`;

  await fs.writeFile(path.join(policyDefsPath, "WindowsRemoteManagement.admx"), winrmAdmx);
  await fs.writeFile(path.join(enUsPath, "WindowsRemoteManagement.adml"), winrmAdml);

  // Create GroupPolicy.admx
  const gpAdmx = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitions xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                    revision="1.0" schemaVersion="1.0">
  <policyNamespaces>
    <target prefix="GP" namespace="Microsoft.Policies.GroupPolicy" />
  </policyNamespaces>
  <resources minRequiredRevision="1.0" />
  <categories>
    <category name="GroupPolicy" displayName="Gruppenrichtlinie">
      <parentCategory ref="GP:System" />
    </category>
    <category name="RegistryPolicyProcessing" displayName="Registrierungsrichtlinienverarbeitung">
      <parentCategory ref="GP:GroupPolicy" />
    </category>
  </categories>
  <policies>
    <policy name="NoBackgroundPolicy" class="Machine" displayName="Hintergrundverarbeitung von Richtlinien" 
            explainText="Legt fest, ob Richtlinien im Hintergrund verarbeitet werden." 
            key="SOFTWARE\\Policies\\Microsoft\\Windows\\Group Policy\\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}" valueName="NoBackgroundPolicy">
      <parentCategory ref="GP:RegistryPolicyProcessing" />
      <supportedOn ref="GP:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="0" /></enabledValue>
      <disabledValue><decimal value="1" /></disabledValue>
    </policy>
    <policy name="NoGPOListChanges" class="Machine" displayName="GPO-Listenänderungen ignorieren" 
            explainText="Legt fest, ob Änderungen an der GPO-Liste ignoriert werden." 
            key="SOFTWARE\\Policies\\Microsoft\\Windows\\Group Policy\\{35378EAC-683F-11D2-A89A-00C04FBBCFA2}" valueName="NoGPOListChanges">
      <parentCategory ref="GP:RegistryPolicyProcessing" />
      <supportedOn ref="GP:SUPPORTED_WindowsVista" />
      <enabledValue><decimal value="1" /></enabledValue>
      <disabledValue><decimal value="0" /></disabledValue>
    </policy>
  </policies>
  <supportedOn>
    <definitions>
      <definition name="SUPPORTED_WindowsVista" displayName="Mindestens Windows Vista" />
    </definitions>
  </supportedOn>
</policyDefinitions>`;

  const gpAdml = `<?xml version="1.0" encoding="utf-8"?>
<policyDefinitionResources xmlns="http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions" 
                           revision="1.0" schemaVersion="1.0">
  <displayName>Group Policy Administrative Templates</displayName>
  <description>Administrative Vorlagen für Gruppenrichtlinien</description>
  <resources>
    <stringTable>
      <string id="System">System</string>
      <string id="GroupPolicy">Gruppenrichtlinie</string>
      <string id="RegistryPolicyProcessing">Registrierungsrichtlinienverarbeitung</string>
      <string id="NoBackgroundPolicy">Hintergrundverarbeitung von Richtlinien</string>
      <string id="NoGPOListChanges">GPO-Listenänderungen ignorieren</string>
      <string id="SUPPORTED_WindowsVista">Mindestens Windows Vista</string>
    </stringTable>
  </resources>
</policyDefinitionResources>`;

  await fs.writeFile(path.join(policyDefsPath, "GroupPolicy.admx"), gpAdmx);
  await fs.writeFile(path.join(enUsPath, "GroupPolicy.adml"), gpAdml);
}

/**
 * Build category tree from ADMX definitions
 */
export function buildCategoryTree(definitions: AdmxDefinitions): AdmxCategory[] {
  const rootCategories: AdmxCategory[] = [];

  // Find root categories (no parent)
  for (const [name, category] of definitions.categories) {
    if (!category.parentCategory) {
      rootCategories.push(category);
    }
  }

  return rootCategories;
}

/**
 * Get child categories for a parent category (for lazy loading)
 */
export function getAdmxCategoriesByParent(definitions: AdmxDefinitions, parentName: string): AdmxCategory[] {
  const children: AdmxCategory[] = [];
  
  for (const [name, category] of definitions.categories) {
    if (category.parentCategory) {
      // Extract the category name from "prefix:CategoryName"
      const catName = category.parentCategory.split(":").pop();
      if (catName === parentName) {
        children.push(category);
      }
    }
  }
  
  return children;
}

/**
 * Get policies for a specific category (for lazy loading)
 */
export function getAdmxPoliciesByCategory(definitions: AdmxDefinitions, categoryName: string): AdmxPolicy[] {
  const category = definitions.categories.get(categoryName);
  if (!category) return [];
  
  return category.policies;
}
