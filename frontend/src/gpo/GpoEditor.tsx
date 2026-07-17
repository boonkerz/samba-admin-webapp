import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { GpoObject } from "@samba-admin/shared";
import { api } from "../api/client";
import { useToastStore } from "../state/toastStore";
import { ResizeHandle } from "../components/ResizeHandle";
import { useResizablePane } from "../hooks/useResizablePane";
import { PrinterPreferencesPanel } from "./PrinterPreferencesPanel";
import { RegistryPreferencesPanel } from "./RegistryPreferencesPanel";
import { DriveMapsPanel } from "./DriveMapsPanel";
import { ScheduledTasksPanel } from "./ScheduledTasksPanel";
import { PowerOptionsPanel } from "./PowerOptionsPanel";
import { EnvironmentVariablesPanel } from "./EnvironmentVariablesPanel";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { FilesPanel } from "./FilesPanel";
import { FoldersPanel } from "./FoldersPanel";
import { IniFilesPanel } from "./IniFilesPanel";
import { LocalUserGroupsPanel } from "./LocalUserGroupsPanel";
import { FolderOptionsPanel } from "./FolderOptionsPanel";
import { RegionalOptionsPanel } from "./RegionalOptionsPanel";
import { StartMenuPanel } from "./StartMenuPanel";
import { NetworkOptionsPanel } from "./NetworkOptionsPanel";
import { DataSourcesPanel } from "./DataSourcesPanel";
import { DevicesPanel } from "./DevicesPanel";
import { InternetSettingsPanel } from "./InternetSettingsPanel";
import { NetworkSharesPanel } from "./NetworkSharesPanel";
import { ServicesPanel } from "./ServicesPanel";
import { ScriptsPanel } from "./ScriptsPanel";
import { AdmxImportDialog } from "./AdmxImportDialog";

interface RegistryPolEntry {
  key: string;
  valueName: string;
  valueType: "REG_DWORD" | "REG_SZ" | "REG_EXPAND_SZ" | "REG_MULTI_SZ" | "REG_BINARY";
  value: string | number;
}

interface GpoSettings {
  guid: string;
  displayName: string;
  machineSettings: RegistryPolEntry[];
  userSettings: RegistryPolEntry[];
  gptVersion: number;
}

interface AdmxPolicy {
  name: string;
  class: "User" | "Machine" | "Both";
  displayName: string;
  explainText?: string;
  key: string;
  valueName: string;
  parentCategory?: string;
  supportedOn?: string;
  elements?: AdmxElement[];
  enabledValue?: string | number;
  disabledValue?: string | number;
}

interface AdmxElement {
  id: string;
  type: "boolean" | "decimal" | "longDecimal" | "text" | "multiText" | "enum" | "list";
  label?: string;
  valueName?: string;
  key?: string;
  /** See handleListChange: default (false/absent) means valueName = item text, not a sequential index. */
  explicitValue?: boolean;
  minValue?: number;
  maxValue?: number;
  default?: unknown;
  items?: { displayName: string; value: unknown }[];
}

interface AdmxCategory {
  name: string;
  displayName: string;
  parentCategory?: string;
  children?: AdmxCategory[];
  policies?: AdmxPolicy[];
  hasChildren?: boolean;
  /**
   * Whether this category (or any descendant) has a policy applicable to
   * the Machine/User config side, computed server-side (admx.service.ts).
   * Real GPME hides a whole category from a config side if nothing in its
   * subtree applies there — e.g. the top-level "Printers" category is all
   * Machine-class policies, so it must never render under Benutzerkonfiguration
   * even though the raw category list doesn't otherwise distinguish scope.
   */
  hasMachinePolicy?: boolean;
  hasUserPolicy?: boolean;
}

type EditorNodeType =
  | "computer-config"
  | "user-config"
  | "policies"
  | "software-settings"
  | "windows-settings"
  | "admin-templates"
  | "preferences"
  | "control-panel"
  | "scripts"
  | "security"
  | "folder-redirection"
  | "qos"
  | "printers"
  | "admin-category"
  | "admin-subcategory"
  | "admin-policy"
  | "gpp-printers"
  | "gpp-registry"
  | "gpp-drivemaps"
  | "gpp-scheduledtasks"
  | "gpp-poweroptions"
  | "gpp-envvars"
  | "gpp-shortcuts"
  | "gpp-files"
  | "gpp-folders"
  | "gpp-inifiles"
  | "gpp-localgroups"
  | "gpp-folderoptions"
  | "gpp-regionaloptions"
  | "gpp-startmenu"
  | "gpp-networkoptions"
  | "gpp-datasources"
  | "gpp-devices"
  | "gpp-internetsettings"
  | "gpp-networkshares"
  | "gpp-services";

interface EditorNode {
  id: string;
  type: EditorNodeType;
  name: string;
  children?: EditorNode[];
  icon: "folder" | "computer" | "user" | "policy" | "settings" | "script" | "security" | "printer" | "network" | "windows";
  policy?: {
    key: string;
    valueName: string;
    description?: string;
    options?: { label: string; value: number }[];
    currentValue?: number | string;
    elements?: AdmxElement[];
    scope?: "machine" | "user";
    enabledValue?: number | string;
    disabledValue?: number | string;
  };
  categoryName?: string;
  isLoaded?: boolean;
  /**
   * Raw ADMX category data (static, safe to keep around) plus the parentId
   * it was built under (needed to resolve machine vs. user scope). Policy
   * status/values are deliberately NOT baked in here — see computePolicyItems.
   */
  category?: AdmxCategory;
  parentId?: string;
}

interface PolicyItem {
  name: string;
  description?: string;
  key: string;
  valueName: string;
  scope: "machine" | "user";
  options?: { label: string; value: number }[];
  currentValue?: number | string;
  elements?: AdmxElement[];
  enabledValue?: string | number;
  disabledValue?: string | number;
  listValues?: string[];
}

export function GpoEditor({ gpo, onClose }: { gpo: GpoObject; onClose: () => void }) {
  const { width: treeWidth, onResizeMouseDown } = useResizablePane("gpo-editor-tree-width", 320, 220, 700);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["computer-config", "computer-policies", "user-config", "user-policies"]));
  const [selectedNode, setSelectedNode] = useState<EditorNode | null>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyItem | null>(null);
  const [activeTab, setActiveTab] = useState<"standard" | "advanced">("standard");
  const [showAdmxImport, setShowAdmxImport] = useState(false);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const settingsQuery = useQuery({
    queryKey: ["gpo-settings", gpo.guid],
    queryFn: () => api.get<GpoSettings>(`/api/gpo/settings/${gpo.guid}`),
  });

  const rootCategoriesQuery = useQuery({
    queryKey: ["gpo-admx-root-categories"],
    queryFn: () => api.get<AdmxCategory[]>("/api/gpo/admx-categories"),
  });

  const settings = settingsQuery.data;
  const rootCategories = rootCategoriesQuery.data ?? [];
  const tree = buildGpoTree(rootCategories);

  // Refresh settings when selected node changes
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["gpo-settings", gpo.guid] });
  }, [selectedNode, selectedPolicy, queryClient, gpo.guid]);

  const updateMutation = useMutation({
    mutationFn: async ({ scope, entries }: { scope: "machine" | "user"; entries: RegistryPolEntry[] }) => {
      await api.put(`/api/gpo/settings/${gpo.guid}/${scope}`, entries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gpo-settings", gpo.guid] });
      pushToast("success", "Einstellung gespeichert.");
    },
    onError: (err) => pushToast("error", (err as Error).message),
  });

  function toggleExpand(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const loadChildren = useCallback(async (categoryName: string) => {
    try {
      const children = await api.get<AdmxCategory[]>(`/api/gpo/admx-categories/${categoryName}`);
      return children;
    } catch (err) {
      console.error("Failed to load children:", err);
      return [];
    }
  }, []);

  function handleSettingChange(node: EditorNode, value: number | string | undefined) {
    if (!node.policy) return;

    const scope =
      node.policy.scope ?? (node.id.startsWith("computer-") || node.id.startsWith("machine-") ? "machine" : "user");
    const currentSettings = scope === "machine" ? settings?.machineSettings ?? [] : settings?.userSettings ?? [];

    const existingIndex = currentSettings.findIndex(
      (s) => s.key === node.policy!.key && s.valueName === node.policy!.valueName
    );

    if (value === undefined) {
      // "Nicht konfiguriert": remove the entry (and any associated list entries)
      // entirely rather than persisting a sentinel value — Registry.pol has no
      // concept of "unconfigured", only "entry present" or "entry absent".
      const listElement = node.policy.elements?.find((e) => e.type === "list");
      const listKey = listElement?.key;
      const newEntries = currentSettings.filter(
        (s) =>
          !(s.key === node.policy!.key && s.valueName === node.policy!.valueName) && (!listKey || s.key !== listKey)
      );
      updateMutation.mutate({ scope, entries: newEntries });
      return;
    }

    // Determine the correct value type
    let valueType: RegistryPolEntry["valueType"];
    let finalValue: string | number;

    if (typeof value === "number") {
      // Numeric values are always DWORD
      valueType = "REG_DWORD";
      finalValue = value;
    } else if (node.policy.options && node.policy.options.length > 0) {
      // Options with numeric values are DWORD
      valueType = "REG_DWORD";
      finalValue = parseInt(value) || 0;
    } else {
      // Text values are SZ
      valueType = "REG_SZ";
      finalValue = value;
    }

    let newEntries: RegistryPolEntry[];
    if (existingIndex >= 0) {
      newEntries = [...currentSettings];
      newEntries[existingIndex] = {
        ...newEntries[existingIndex],
        value: finalValue,
        valueType,
      };
    } else {
      newEntries = [
        ...currentSettings,
        {
          key: node.policy.key,
          valueName: node.policy.valueName,
          value: finalValue,
          valueType,
        },
      ];
    }

    updateMutation.mutate({ scope, entries: newEntries });
  }

  function handleListChange(node: EditorNode, values: string[]) {
    if (!node.policy) return;

    const scope =
      node.policy.scope ?? (node.id.startsWith("computer-") || node.id.startsWith("machine-") ? "machine" : "user");
    const currentSettings = scope === "machine" ? settings?.machineSettings ?? [] : settings?.userSettings ?? [];

    // Find list element to get the correct key
    const listElement = node.policy.elements?.find((e) => e.type === "list");
    const listKey = listElement?.key || node.policy.key;

    // Remove existing entries for the list key
    const filtered = currentSettings.filter(
      (s) => s.key !== listKey
    );

    // Also remove the main policy entry (we'll re-add it as enabled)
    const filteredWithoutMain = filtered.filter(
      (s) => !(s.key === node.policy!.key && s.valueName === node.policy!.valueName)
    );

    // Add the "enabled" flag under the main key, using ADMX's own enabledValue when known.
    const enabledFlag = node.policy.enabledValue ?? 1;
    const newEntries: RegistryPolEntry[] = [
      ...filteredWithoutMain,
      {
        key: node.policy.key,
        valueName: node.policy.valueName,
        value: enabledFlag,
        valueType: typeof enabledFlag === "number" ? "REG_DWORD" : "REG_SZ",
      },
    ];

    // Add list entries under the list key. Per the ADMX schema, a `list`
    // element defaults to explicitValue="false": each item is its own
    // registry value with BOTH the value name and the data set to the item
    // text (e.g. an approved server "printsrv01" -> valueName="printsrv01",
    // value="printsrv01"). Only explicitValue="true" list elements use
    // sequential numeric value names instead — using the wrong scheme means
    // real Windows (gpedit/GPMC) won't recognize the entries as configured.
    values.forEach((v, i) => {
      newEntries.push({
        key: listKey,
        valueName: listElement?.explicitValue ? `${i + 1}` : v,
        value: v,
        valueType: "REG_SZ",
      });
    });

    updateMutation.mutate({ scope, entries: newEntries });
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-slate-400">Lade GPO-Einstellungen...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="h-5 w-5 text-indigo-500" aria-hidden="true">
            <rect x="2" y="1" width="12" height="14" rx="1" fill="currentColor" opacity="0.15" />
            <rect x="2" y="1" width="12" height="14" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
            <rect x="5" y="4" width="6" height="1" fill="currentColor" />
            <rect x="5" y="6.5" width="6" height="1" fill="currentColor" />
            <rect x="5" y="9" width="4" height="1" fill="currentColor" />
          </svg>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Gruppenrichtlinienverwaltungs-Editor
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left tree panel */}
        <div
          style={{ width: treeWidth }}
          className="shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            {gpo.displayName} [Samba] Richtlinie
          </div>
          {tree.map((node) => (
            <LazyTreeNode
              key={node.id}
              node={node}
              depth={0}
              expandedNodes={expandedNodes}
              onToggle={toggleExpand}
              onSelect={setSelectedNode}
              selectedId={selectedNode?.id ?? null}
              loadChildren={loadChildren}
              settings={settings}
            />
          ))}
        </div>

        <ResizeHandle onMouseDown={onResizeMouseDown} />

        {/* Right content panel */}
        <div className="flex flex-1 flex-col bg-white dark:bg-slate-900">
          {/* Header */}
          <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-700">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {selectedPolicy ? selectedPolicy.name : selectedNode ? selectedNode.name : "Standard"}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {selectedPolicy ? (
              <PolicyEditorForm
                key={`${selectedPolicy.key}-${selectedPolicy.valueName}`}
                policy={selectedPolicy}
                onBack={() => setSelectedPolicy(null)}
                onSettingChange={(value) => {
                  const node: EditorNode = {
                    id: `policy-${selectedPolicy.key}-${selectedPolicy.valueName}`,
                    type: "admin-policy",
                    name: selectedPolicy.name,
                    icon: "policy",
                    policy: selectedPolicy,
                  };
                  handleSettingChange(node, value);
                  // Don't close editor - stay in the edit view
                  // Update the policy's currentValue to reflect the change
                  setSelectedPolicy({ ...selectedPolicy, currentValue: value });
                }}
                onListChange={(values) => {
                  const node: EditorNode = {
                    id: `policy-${selectedPolicy.key}-${selectedPolicy.valueName}`,
                    type: "admin-policy",
                    name: selectedPolicy.name,
                    icon: "policy",
                    policy: selectedPolicy,
                  };
                  handleListChange(node, values);
                  // Don't close editor - stay in the edit view. currentValue
                  // deliberately untouched here — it reflects only the
                  // master flag, never the list contents (see listValues).
                }}
              />
            ) : selectedNode?.type === "gpp-printers" ? (
              <PrinterPreferencesPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-drivemaps" ? (
              <DriveMapsPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-networkshares" ? (
              <NetworkSharesPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-services" ? (
              <ServicesPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-registry" ? (
              <RegistryPreferencesPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "scripts" ? (
              <ScriptsPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-scheduledtasks" ? (
              <ScheduledTasksPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-poweroptions" ? (
              <PowerOptionsPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-envvars" ? (
              <EnvironmentVariablesPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-shortcuts" ? (
              <ShortcutsPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-files" ? (
              <FilesPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-folders" ? (
              <FoldersPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-inifiles" ? (
              <IniFilesPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-localgroups" ? (
              <LocalUserGroupsPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-devices" ? (
              <DevicesPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-internetsettings" ? (
              <InternetSettingsPanel gpo={gpo} scope={selectedNode.id.startsWith("computer") ? "machine" : "user"} />
            ) : selectedNode?.type === "gpp-folderoptions" ? (
              <FolderOptionsPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-regionaloptions" ? (
              <RegionalOptionsPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-startmenu" ? (
              <StartMenuPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-networkoptions" ? (
              <NetworkOptionsPanel gpo={gpo} />
            ) : selectedNode?.type === "gpp-datasources" ? (
              <DataSourcesPanel gpo={gpo} />
            ) : selectedNode ? (
              <NodeContent
                node={selectedNode}
                settings={settings}
                onSettingChange={handleSettingChange}
                onSelectPolicy={setSelectedPolicy}
                onImportAdmx={() => setShowAdmxImport(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                Markieren Sie ein Element, um dessen Beschreibung anzuzeigen.
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab("advanced")}
              className={`px-4 py-2 text-sm ${
                activeTab === "advanced"
                  ? "border-t-2 border-indigo-500 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              Erweitert
            </button>
            <button
              onClick={() => setActiveTab("standard")}
              className={`px-4 py-2 text-sm ${
                activeTab === "standard"
                  ? "border-t-2 border-indigo-500 bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              Standard
            </button>
          </div>
        </div>
      </div>
      {showAdmxImport && <AdmxImportDialog onDone={() => setShowAdmxImport(false)} />}
    </div>
  );
}

// Lazy loading tree node component
function LazyTreeNode({
  node,
  depth,
  expandedNodes,
  onToggle,
  onSelect,
  selectedId,
  loadChildren,
  settings,
}: {
  node: EditorNode;
  depth: number;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: EditorNode) => void;
  selectedId: string | null;
  loadChildren: (categoryName: string) => Promise<AdmxCategory[]>;
  settings?: GpoSettings;
}) {
  // The fetched ADMX category *structure* is static and safe to cache once
  // it's loaded — only the settings-derived values (handled inside
  // NodeContent/computePolicyItems from the live `settings` prop, not baked
  // in here) need to stay fresh across edits.
  const [rawChildren, setRawChildren] = useState<AdmxCategory[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;
  // node.id carries a "computer"/"user" prefix from the root all the way
  // down (see createCategoryNode) — real GPME hides a whole subcategory
  // from a config side if nothing in its subtree applies there (see
  // hasMachinePolicy/hasUserPolicy doc comment on AdmxCategory).
  const isComputerScope = node.id.startsWith("computer");
  const children =
    node.children ??
    rawChildren
      ?.filter((cat) => (isComputerScope ? cat.hasMachinePolicy : cat.hasUserPolicy))
      .map((cat) => createCategoryNode(cat, node.id));
  const hasExpand = (children && children.length > 0) || (node.categoryName && rawChildren === null);

  useEffect(() => {
    if (isExpanded && node.categoryName && rawChildren === null && !isLoading && !node.children) {
      setIsLoading(true);
      loadChildren(node.categoryName).then((categories) => {
        setRawChildren(categories);
        setIsLoading(false);
      });
    }
  }, [isExpanded, node.categoryName, rawChildren, isLoading, loadChildren, node.children]);

  return (
    <>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
          isSelected ? "bg-indigo-50 dark:bg-indigo-950" : ""
        }`}
        style={{ paddingLeft: depth * 14 + 4 }}
        onClick={() => onSelect(node)}
      >
        {hasExpand ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="w-4 text-xs text-slate-400"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <EditorIcon type={node.icon} />
        <span className="truncate text-slate-700 dark:text-slate-300">{node.name}</span>
        {isLoading && <span className="ml-2 text-xs text-slate-400">Lade...</span>}
      </div>
      {isExpanded &&
        children?.map((child) => (
          <LazyTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            onSelect={onSelect}
            selectedId={selectedId}
            loadChildren={loadChildren}
            settings={settings}
          />
        ))}
    </>
  );
}

/**
 * Builds the per-policy status/value view for a category from the *current*
 * settings. Deliberately kept separate from tree construction (createCategoryNode)
 * and NOT cached anywhere: it must be recomputed every render from live
 * `settings`, since the ADMX category/policy structure is static (safe to
 * cache/fetch once) but the configured values change on every save. Baking
 * this into a cached tree node used to mean an already-selected or
 * already-expanded node kept showing stale ("Nicht konfiguriert") values
 * after an edit, until a full page reload rebuilt everything from scratch.
 */
function computePolicyItems(category: AdmxCategory, parentId: string, settings?: GpoSettings): PolicyItem[] {
  const isComputer = parentId.startsWith("computer");

  // A category shown on both config sides (e.g. it has both Machine- and
  // User-class policies) must still only list the policies applicable to
  // the side being viewed — real GPME never shows a Machine-only policy
  // under Benutzerkonfiguration or vice versa, "Both" policies show on both.
  return (category.policies ?? [])
    .filter((policy) => policy.class === "Both" || policy.class === (isComputer ? "Machine" : "User"))
    .map((policy) => {
      const parentKey = policy.key.includes("\\")
        ? policy.key.substring(0, policy.key.lastIndexOf("\\"))
        : policy.key;

      // Check if this policy has a list element
      const listElement = policy.elements?.find((e) => e.type === "list");

      // currentValue always reflects the policy's own master flag (exact
      // key/valueName match) — regardless of whether it also has a list
      // element. A list's items live under a *different* registry key (see
      // findListValues below) and must never be folded into this value:
      // doing so previously meant the literal "enabled, no items yet"
      // sentinel got misread as a real first list entry ("1") once any real
      // items were added.
      const findValue = (settingsList: RegistryPolEntry[] | undefined) => {
        if (!settingsList) return undefined;

        const exact = settingsList.find(
          (s) => s.key === policy.key && s.valueName === policy.valueName
        );
        if (exact) return exact.value;

        const parentMatch = settingsList.find(
          (s) => s.key === parentKey && s.valueName === policy.valueName
        );
        if (parentMatch) return parentMatch.value;

        return undefined;
      };

      const currentValue = findValue(settings?.machineSettings) ?? findValue(settings?.userSettings);

      let listValues: string[] | undefined;
      if (listElement?.key) {
        const findListValues = (settingsList: RegistryPolEntry[] | undefined) =>
          settingsList?.filter((s) => s.key === listElement.key).map((s) => String(s.value)) ?? [];
        const machineList = findListValues(settings?.machineSettings);
        const userList = findListValues(settings?.userSettings);
        listValues = machineList.length > 0 ? machineList : userList;
      }

      let options: { label: string; value: number }[] | undefined;
      if (policy.elements) {
        const enumElement = policy.elements.find((e) => e.type === "enum");
        if (enumElement?.items) {
          options = enumElement.items.map((item) => ({
            label: item.displayName,
            value: item.value as number,
          }));
        }
      }

      return {
        name: policy.displayName,
        description: policy.explainText,
        key: policy.key,
        valueName: policy.valueName,
        scope: isComputer ? "machine" : "user",
        options,
        currentValue,
        elements: policy.elements,
        enabledValue: policy.enabledValue,
        disabledValue: policy.disabledValue,
        listValues,
      };
    });
}

function createCategoryNode(category: AdmxCategory, parentId: string): EditorNode {
  return {
    id: `${parentId}-${category.name}`,
    type: "admin-category" as EditorNodeType,
    name: category.displayName,
    icon: "folder" as const,
    categoryName: category.name,
    isLoaded: false,
    category,
    parentId,
  } as EditorNode;
}

function buildGpoTree(rootCategories: AdmxCategory[]): EditorNode[] {
  const computerAdminChildren: EditorNode[] = [];
  const userAdminChildren: EditorNode[] = [];

  for (const category of rootCategories) {
    if (category.hasMachinePolicy) {
      computerAdminChildren.push(createCategoryNode(category, "computer"));
    }
    if (category.hasUserPolicy) {
      userAdminChildren.push(createCategoryNode(category, "user"));
    }
  }

  return [
    {
      id: "computer-config",
      type: "computer-config",
      name: "Computerkonfiguration",
      icon: "computer",
      children: [
        {
          id: "computer-policies",
          type: "policies",
          name: "Richtlinien",
          icon: "folder",
          children: [
            {
              id: "computer-software",
              type: "software-settings",
              name: "Softwareeinstellungen",
              icon: "settings",
            },
            {
              id: "computer-windows",
              type: "windows-settings",
              name: "Windows-Einstellungen",
              icon: "windows",
              children: [
                { id: "computer-scripts", type: "scripts", name: "Skripts (Start/Herunterfahren)", icon: "script" },
                { id: "computer-security", type: "security", name: "Sicherheitseinstellungen", icon: "security" },
                { id: "computer-redirection", type: "folder-redirection", name: "Ordnerumleitung", icon: "network" },
                { id: "computer-qos", type: "qos", name: "Richtlinienbasierter QoS", icon: "network" },
                { id: "computer-printers", type: "printers", name: "Bereitgestellte Drucker", icon: "printer" },
              ],
            },
            {
              id: "computer-admin",
              type: "admin-templates",
              name: "Administrative Vorlagen",
              icon: "policy",
              children: computerAdminChildren,
            },
          ],
        },
        {
          id: "computer-settings",
          type: "preferences",
          name: "Einstellungen",
          icon: "settings",
          children: [
            {
              id: "computer-pref-windows",
              type: "windows-settings",
              name: "Windows-Einstellungen",
              icon: "folder",
              children: [
                { id: "computer-pref-envvars", type: "gpp-envvars", name: "Umgebungsvariablen", icon: "settings" },
                { id: "computer-pref-files", type: "gpp-files", name: "Dateien", icon: "settings" },
                { id: "computer-pref-folders", type: "gpp-folders", name: "Ordner", icon: "settings" },
                { id: "computer-pref-inifiles", type: "gpp-inifiles", name: "INI-Dateien", icon: "settings" },
                { id: "computer-pref-networkshares", type: "gpp-networkshares", name: "Netzwerkfreigaben", icon: "network" },
                { id: "computer-pref-registry", type: "gpp-registry", name: "Registrierung", icon: "settings" },
                { id: "computer-pref-shortcuts", type: "gpp-shortcuts", name: "Verknüpfungen", icon: "settings" },
              ],
            },
            {
              id: "computer-pref-control",
              type: "control-panel",
              name: "Systemsteuerungseinstellungen",
              icon: "settings",
              children: [
                { id: "computer-pref-devices", type: "gpp-devices", name: "Geräte", icon: "settings" },
                { id: "computer-pref-internetsettings", type: "gpp-internetsettings", name: "Interneteinstellungen", icon: "settings" },
                { id: "computer-pref-localgroups", type: "gpp-localgroups", name: "Lokale Benutzer und Gruppen", icon: "settings" },
                { id: "computer-pref-scheduledtasks", type: "gpp-scheduledtasks", name: "Geplante Aufgaben", icon: "settings" },
                { id: "computer-pref-services", type: "gpp-services", name: "Dienste", icon: "settings" },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "user-config",
      type: "user-config",
      name: "Benutzerkonfiguration",
      icon: "user",
      children: [
        {
          id: "user-policies",
          type: "policies",
          name: "Richtlinien",
          icon: "folder",
          children: [
            {
              id: "user-software",
              type: "software-settings",
              name: "Softwareeinstellungen",
              icon: "settings",
            },
            {
              id: "user-windows",
              type: "windows-settings",
              name: "Windows-Einstellungen",
              icon: "windows",
              children: [
                { id: "user-scripts", type: "scripts", name: "Skripts (Anmelden/Abmelden)", icon: "script" },
                { id: "user-security", type: "security", name: "Sicherheitseinstellungen", icon: "security" },
              ],
            },
            {
              id: "user-admin",
              type: "admin-templates",
              name: "Administrative Vorlagen",
              icon: "policy",
              children: userAdminChildren,
            },
          ],
        },
        {
          id: "user-settings",
          type: "preferences",
          name: "Einstellungen",
          icon: "settings",
          children: [
            {
              id: "user-pref-windows",
              type: "windows-settings",
              name: "Windows-Einstellungen",
              icon: "folder",
              children: [
                { id: "user-pref-drivemaps", type: "gpp-drivemaps", name: "Laufwerkzuordnungen", icon: "network" },
                { id: "user-pref-envvars", type: "gpp-envvars", name: "Umgebungsvariablen", icon: "settings" },
                { id: "user-pref-files", type: "gpp-files", name: "Dateien", icon: "settings" },
                { id: "user-pref-folders", type: "gpp-folders", name: "Ordner", icon: "settings" },
                { id: "user-pref-inifiles", type: "gpp-inifiles", name: "INI-Dateien", icon: "settings" },
                { id: "user-pref-registry", type: "gpp-registry", name: "Registrierung", icon: "settings" },
                { id: "user-pref-shortcuts", type: "gpp-shortcuts", name: "Verknüpfungen", icon: "settings" },
              ],
            },
            {
              id: "user-pref-control",
              type: "control-panel",
              name: "Systemsteuerungseinstellungen",
              icon: "settings",
              children: [
                { id: "user-pref-datasources", type: "gpp-datasources", name: "Datenquellen", icon: "settings" },
                { id: "user-pref-devices", type: "gpp-devices", name: "Geräte", icon: "settings" },
                { id: "user-pref-internetsettings", type: "gpp-internetsettings", name: "Interneteinstellungen", icon: "settings" },
                { id: "user-pref-folderoptions", type: "gpp-folderoptions", name: "Ordneroptionen", icon: "settings" },
                { id: "user-pref-localgroups", type: "gpp-localgroups", name: "Lokale Benutzer und Gruppen", icon: "settings" },
                { id: "user-pref-networkoptions", type: "gpp-networkoptions", name: "Netzwerkoptionen", icon: "network" },
                { id: "user-pref-printers", type: "gpp-printers", name: "Drucker", icon: "printer" },
                { id: "user-pref-regionaloptions", type: "gpp-regionaloptions", name: "Regionale Einstellungen", icon: "settings" },
                { id: "user-pref-scheduledtasks", type: "gpp-scheduledtasks", name: "Geplante Aufgaben", icon: "settings" },
                { id: "user-pref-poweroptions", type: "gpp-poweroptions", name: "Energieoptionen", icon: "settings" },
                { id: "user-pref-startmenu", type: "gpp-startmenu", name: "Startmenü", icon: "settings" },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function EditorIcon({ type }: { type: EditorNode["icon"] }) {
  const FolderIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M1 3.5c0-.28.22-.5.5-.5h3.29l1.42 1.42c.1.1.24.16.38.16h6.41c.28 0 .5.22.5.5v7c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5v-8.5z" fill="#FFC107" stroke="#F9A825" strokeWidth="0.5" />
      <path d="M1 4h14v7.5c0 .28-.22.5-.5.5h-11c-.28 0-.5-.22-.5-.5V4z" fill="#FFD54F" />
    </svg>
  );

  const PolicyIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <rect x="2" y="1" width="12" height="14" rx="1" fill="#E3F2FD" stroke="#1976D2" strokeWidth="0.8" />
      <path d="M8 4L5 5.5v2.5c0 2.2 1.3 4.2 3 5 1.7-.8 3-2.8 3-5V5.5L8 4z" fill="#1976D2" opacity="0.8" />
      <rect x="6" y="7" width="4" height="1" rx="0.5" fill="white" />
      <rect x="6" y="9" width="3" height="1" rx="0.5" fill="white" />
    </svg>
  );

  const SettingsIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="none" stroke="#607D8B" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1" fill="#607D8B" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="#607D8B" strokeWidth="1" />
    </svg>
  );

  const ScriptIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" rx="1.5" fill="#263238" />
      <path d="M4 7l2 2-2 2" stroke="#4CAF50" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="11" x2="11" y2="11" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  const SecurityIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M8 1L2 4v4c0 4 2.5 7 6 8 3.5-1 6-4 6-8V4L8 1z" fill="#FFC107" stroke="#F9A825" strokeWidth="0.5" />
      <path d="M8 3L4 5v3c0 2.8 1.7 5 4 5.6 2.3-.6 4-2.8 4-5.6V5L8 3z" fill="#FFD54F" />
      <path d="M6.5 8l1.5 1.5L10.5 6" stroke="#F57F17" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const NetworkIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="4" cy="4" r="2" fill="#42A5F5" />
      <circle cx="12" cy="4" r="2" fill="#42A5F5" />
      <circle cx="8" cy="12" r="2" fill="#42A5F5" />
      <line x1="5.5" y1="5.5" x2="10.5" y2="5.5" stroke="#42A5F5" strokeWidth="1" />
      <line x1="6" y1="5.5" x2="7" y2="10.5" stroke="#42A5F5" strokeWidth="1" />
      <line x1="10" y1="5.5" x2="9" y2="10.5" stroke="#42A5F5" strokeWidth="1" />
    </svg>
  );

  const PrinterIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="5" width="10" height="6" rx="0.5" fill="#E0E0E0" stroke="#9E9E9E" strokeWidth="0.5" />
      <rect x="4" y="1" width="8" height="5" fill="white" stroke="#9E9E9E" strokeWidth="0.5" />
      <rect x="4" y="11" width="8" height="4" fill="white" stroke="#9E9E9E" strokeWidth="0.5" />
      <circle cx="11" cy="7.5" r="0.8" fill="#4CAF50" />
    </svg>
  );

  const ComputerIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <rect x="1" y="1" width="14" height="10" rx="1" fill="#37474F" />
      <rect x="2" y="2" width="12" height="8" fill="#90CAF9" />
      <rect x="5" y="12" width="6" height="1.5" fill="#37474F" />
      <rect x="3" y="13.5" width="10" height="1" rx="0.5" fill="#37474F" />
    </svg>
  );

  const UserIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="5" r="3" fill="#42A5F5" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="#42A5F5" />
    </svg>
  );

  const WindowsIcon = () => (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M1 2.5l6-.8v6.3H1V2.5zM8 1.5l7-1v7.5H8V1.5zM1 9h6v6.5l-6-.8V9zM8 9h7v6.5l-7-1V9z" fill="#0078D4" />
    </svg>
  );

  switch (type) {
    case "computer": return <ComputerIcon />;
    case "user": return <UserIcon />;
    case "folder": return <FolderIcon />;
    case "policy": return <PolicyIcon />;
    case "settings": return <SettingsIcon />;
    case "script": return <ScriptIcon />;
    case "security": return <SecurityIcon />;
    case "network": return <NetworkIcon />;
    case "printer": return <PrinterIcon />;
    case "windows": return <WindowsIcon />;
    default: return <FolderIcon />;
  }
}

function NodeContent({
  node,
  settings,
  onSettingChange,
  onSelectPolicy,
  onImportAdmx,
}: {
  node: EditorNode;
  settings?: GpoSettings;
  onSettingChange: (node: EditorNode, value: number | string | undefined) => void;
  onSelectPolicy?: (policy: PolicyItem) => void;
  onImportAdmx?: () => void;
}) {
  if (node.policy) {
    return <PolicyEditor node={node} onSettingChange={onSettingChange} />;
  }

  const descriptions: Record<string, string> = {
    "computer-config": "Konfigurationseinstellungen, die für Computer gelten.",
    "user-config": "Konfigurationseinstellungen, die für Benutzer gelten.",
    "policies": "Gruppenrichtlinieneinstellungen für diesen Bereich.",
    "software-settings": "Softwareinstallation und -verwaltung für diesen Bereich.",
    "windows-settings": "Windows-spezifische Einstellungen und Konfigurationen.",
    "admin-templates": "Administrative Vorlagen: Vom lokalen Computer abgerufene Richtliniendefinitionen (ADMX-Dateien).",
    "preferences": "Bevorzugte Einstellungen, die angewendet werden sollen.",
    "control-panel": "Systemsteuerungseinstellungen für Benutzer oder Computer.",
    "scripts": "Skripts, die bei Anmeldung, Abmeldung, Start oder Herunterfahren ausgeführt werden.",
    "security": "Sicherheitseinstellungen wie Kontenrichtlinien, lokale Richtlinien und mehr.",
    "folder-redirection": "Umleitung von Benutzerordnern (Dokumente, Desktop, etc.) zu Netzlaufwerken.",
    "qos": "Quality of Service-Einstellungen für Netzwerkverkehr.",
    "printers": "Drucker, die für Benutzer oder Computer bereitgestellt werden.",
  };

  const description = descriptions[node.id] || descriptions[node.type] || "Einstellungen für diesen Bereich.";
  const policies = node.category ? computePolicyItems(node.category, node.parentId ?? node.id, settings) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
        <EditorIcon type={node.icon} />
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{node.name}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>

      {node.type === "admin-templates" && onImportAdmx && (
        <div>
          <button
            onClick={onImportAdmx}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Vorlagen importieren...
          </button>
        </div>
      )}

      {policies && policies.length > 0 && (
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600">
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Einstellung</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">Kommentar</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy, idx) => {
                const status = policy.currentValue !== undefined
                  ? (typeof policy.currentValue === "number"
                    ? policy.options?.find((o) => o.value === policy.currentValue)?.label ?? "Aktiviert"
                    : "Aktiviert")
                  : "Nicht konfiguriert";
                
                return (
                  <tr
                    key={idx}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    onClick={() => onSelectPolicy?.(policy)}
                  >
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{policy.name}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        status === "Nicht konfiguriert"
                          ? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      }`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(!policies || policies.length === 0) && node.children && node.children.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Unterelemente</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">Name</th>
              </tr>
            </thead>
            <tbody>
              {node.children.map((child) => (
                <tr key={child.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{child.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PolicyEditor({
  node,
  onSettingChange,
}: {
  node: EditorNode;
  onSettingChange: (node: EditorNode, value: number | string | undefined) => void;
}) {
  const policy = node.policy!;
  const [customValue, setCustomValue] = useState(policy.currentValue?.toString() ?? "");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{node.name}</h3>
        {policy.description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{policy.description}</p>
        )}
      </div>

      <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
        <div className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">
          Registrierungspfad: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{policy.key}</code>
        </div>
        <div className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">
          Name: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{policy.valueName}</code>
        </div>

        {policy.options ? (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Optionen:</label>
            {policy.options.map((option) => (
              <label key={option.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`policy-${node.id}`}
                  checked={policy.currentValue === option.value}
                  onChange={() => onSettingChange(node, option.value)}
                  className="text-indigo-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">{option.label}</span>
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`policy-${node.id}`}
                checked={policy.currentValue === undefined}
                onChange={() => onSettingChange(node, undefined)}
                className="text-indigo-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Nicht konfiguriert</span>
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Wert:</label>
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={() => onSettingChange(node, customValue)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              placeholder="Wert eingeben..."
            />
          </div>
        )}
      </div>

      <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
        <p className="mb-1 font-medium">Hinweis</p>
        <p>
          Änderungen werden sofort in der Registry.pol-Datei gespeichert.
          Die Einstellungen werden bei der nächsten Gruppenrichtlinien-Aktualisierung auf die Clients angewendet.
        </p>
      </div>
    </div>
  );
}

// Policy editor form with proper input types
function PolicyEditorForm({
  policy,
  onBack,
  onSettingChange,
  onListChange,
}: {
  policy: {
    name: string;
    description?: string;
    key: string;
    valueName: string;
    options?: { label: string; value: number }[];
    currentValue?: number | string;
    elements?: AdmxElement[];
    enabledValue?: number | string;
    disabledValue?: number | string;
    listValues?: string[];
  };
  onBack: () => void;
  onSettingChange: (value: number | string | undefined) => void;
  onListChange: (values: string[]) => void;
}) {
  const [customValue, setCustomValue] = useState(policy.currentValue?.toString() ?? "");
  // List items live under a separate registry key from the master flag (see
  // createCategoryNode's listValues computation) — never derive them from
  // currentValue, which only ever reflects the master on/off state.
  const [listValues, setListValues] = useState<string[]>(() => policy.listValues ?? []);
  const [newValue, setNewValue] = useState("");

  // The free-text field below only initializes from policy.currentValue on
  // mount; since this component doesn't remount when a save updates
  // currentValue (same policy key/valueName => same React `key`), without
  // this the field would silently go stale — showing empty right after a
  // successful save — and a later blur would overwrite the just-saved value
  // with that stale (often empty) text.
  useEffect(() => {
    setCustomValue(policy.currentValue?.toString() ?? "");
  }, [policy.currentValue]);

  // Same staleness issue as customValue above, for the list editor.
  useEffect(() => {
    setListValues(policy.listValues ?? []);
  }, [policy.listValues]);

  // Determine input type based on elements - only one type at a time
  const hasList = policy.elements?.some((e) => e.type === "list" || e.type === "multiText");
  const hasEnum = !hasList && policy.options && policy.options.length > 0;
  const isBoolean = !hasList && !hasEnum && policy.options?.length === 2 &&
    policy.options.some((o) => o.value === 0) && policy.options.some((o) => o.value === 1);
  const isSimpleText = !hasList && !hasEnum && !isBoolean;
  // Real ADMX-defined Enabled/Disabled values take priority over any of the
  // above guesses — most plain on/off policies have no "elements" at all and
  // rely entirely on <enabledValue>/<disabledValue> to say what to write.
  const hasDisabledValue = policy.disabledValue !== undefined;
  const isDisabledState = hasDisabledValue && policy.currentValue === policy.disabledValue;

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
        <button
          onClick={onBack}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 4L6 8l4 4" />
          </svg>
        </button>
        <div>
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200">{policy.name}</h3>
          {policy.description && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{policy.description}</p>
          )}
        </div>
      </div>

      {/* Requirements */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium">Anforderungen:</span> Mindestens Windows Server 2003
      </div>

      {/* Description */}
      {policy.description && (
        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {policy.description}
        </div>
      )}

      {/* Edit form */}
      <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
        <h4 className="mb-3 text-xs font-medium text-slate-600 dark:text-slate-300">
          Richtlinieneinstellung bearbeiten
        </h4>

        {/* Not configured / Enabled / Disabled radio buttons */}
        <div className="mb-4 space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="policy-state"
              checked={policy.currentValue === undefined}
              onChange={() => onSettingChange(undefined)}
              className="text-indigo-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Nicht konfiguriert</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="policy-state"
              checked={policy.currentValue !== undefined && !isDisabledState}
              onChange={() => {
                if (policy.enabledValue !== undefined) {
                  onSettingChange(policy.enabledValue);
                } else if (hasEnum && policy.options) {
                  onSettingChange(policy.options[0].value);
                } else if (isBoolean) {
                  onSettingChange(1);
                } else {
                  onSettingChange(customValue || "1");
                }
              }}
              className="text-indigo-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Aktiviert</span>
          </label>
          {/* "Disabled" is only offered when ADMX actually defines a distinct
              <disabledValue> for this policy. Without that, Registry.pol has no
              separate disabled representation beyond "value absent" — which is
              already covered by "Nicht konfiguriert" — so showing a Disabled
              option that would just silently do the same thing would be a fake
              control rather than a real one. */}
          {hasDisabledValue && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="policy-state"
                checked={isDisabledState}
                onChange={() => onSettingChange(policy.disabledValue!)}
                className="text-indigo-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Deaktiviert</span>
            </label>
          )}
        </div>

        {/* Options based on type - only show one type at a time */}
        {policy.currentValue !== undefined && !isDisabledState && (
          <div className="mt-4 space-y-3">
            {/* Enum/Dropdown - for policies with predefined options */}
            {hasEnum && (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Optionen:</label>
                <select
                  value={policy.currentValue}
                  onChange={(e) => onSettingChange(Number(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  {policy.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Boolean checkbox - only for simple on/off policies */}
            {isBoolean && !hasList && !hasEnum && (
              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={policy.currentValue === 1}
                    onChange={(e) => onSettingChange(e.target.checked ? 1 : 0)}
                    className="rounded text-indigo-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {policy.options?.find((o) => o.value === 1)?.label ?? "Aktivieren"}
                  </span>
                </label>
              </div>
            )}

            {/* List editor - only for list/multiText elements */}
            {hasList && (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Werteliste:</label>
                <div className="mt-1 space-y-1">
                  {listValues.map((val, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => {
                          const newValues = [...listValues];
                          newValues[idx] = e.target.value;
                          setListValues(newValues);
                        }}
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      />
                      <button
                        onClick={() => {
                          const newValues = listValues.filter((_, i) => i !== idx);
                          setListValues(newValues);
                          onListChange(newValues);
                        }}
                        className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Neuen Wert eingeben..."
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newValue.trim()) {
                          const newValues = [...listValues, newValue.trim()];
                          setListValues(newValues);
                          onListChange(newValues);
                          setNewValue("");
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (newValue.trim()) {
                          const newValues = [...listValues, newValue.trim()];
                          setListValues(newValues);
                          onListChange(newValues);
                          setNewValue("");
                        }
                      }}
                      className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                    >
                      Hinzufügen
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Text input */}
            {!hasList && !hasEnum && !isBoolean && (
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Wert:</label>
                <input
                  type="text"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onBlur={() => onSettingChange(customValue)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  placeholder="Wert eingeben..."
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
        <p className="mb-1 font-medium">Hinweis</p>
        <p>
          Änderungen werden sofort in der Registry.pol-Datei gespeichert.
          Die Einstellungen werden bei der nächsten Gruppenrichtlinien-Aktualisierung auf die Clients angewendet.
        </p>
      </div>
    </div>
  );
}
