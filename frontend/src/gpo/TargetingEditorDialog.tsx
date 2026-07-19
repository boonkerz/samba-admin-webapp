import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Filter, FilterKind } from "@samba-admin/shared";
import { WindowsDialog, WindowsButton, WinInput, WinSelect, WinLabel, WinCheckbox } from "../components/WindowsDialog";

/** Windows' "Target Editor" — mirrors the Group Policy Preferences Item-Level Targeting dialog available from every preference item's Common tab. */
export function TargetingEditorDialog({ value, onSave, onClose }: { value: Filter[]; onSave: (filters: Filter[]) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filter[]>(value);
  const [newKind, setNewKind] = useState<FilterKind>("FilterGroup");

  function addFilter(parentPath: number[] | null) {
    const created = createDefaultFilter(newKind);
    setFilters((prev) => insertAt(prev, parentPath, created));
  }

  function updateFilter(path: number[], patch: Partial<Filter>) {
    setFilters((prev) => mutateAt(prev, path, (f) => ({ ...f, ...patch }) as Filter));
  }

  function removeFilter(path: number[]) {
    setFilters((prev) => removeAt(prev, path));
  }

  function moveFilter(path: number[], dir: -1 | 1) {
    setFilters((prev) => moveAt(prev, path, dir));
  }

  return (
    <WindowsDialog
      title={t("targeting.title", "Target Editor")}
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      footer={
        <>
          <WindowsButton variant="primary" onClick={() => onSave(filters)}>
            {t("common.close", "Schließen")}
          </WindowsButton>
          <WindowsButton onClick={onClose}>{t("common.cancel", "Abbrechen")}</WindowsButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <WinSelect value={newKind} onChange={(e) => setNewKind(e.target.value as FilterKind)} className="flex-1">
            {FILTER_KINDS.map((k) => (
              <option key={k} value={k}>
                {filterKindLabel(k, t)}
              </option>
            ))}
          </WinSelect>
          <WindowsButton onClick={() => addFilter(null)}>{t("targeting.newItem", "New Item")}</WindowsButton>
        </div>

        <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-sm border border-slate-300 p-2 dark:border-slate-600">
          {filters.length === 0 && <p className="p-4 text-center text-sm text-slate-400">{t("targeting.empty", "No targeting items.")}</p>}
          {filters.map((f, i) => (
            <FilterRow
              key={i}
              filter={f}
              path={[i]}
              isFirst={i === 0}
              onUpdate={updateFilter}
              onRemove={removeFilter}
              onMove={moveFilter}
              onAddChild={addFilter}
              newKind={newKind}
              setNewKind={setNewKind}
            />
          ))}
        </div>
      </div>
    </WindowsDialog>
  );
}

const FILTER_KINDS: FilterKind[] = [
  "FilterGroup",
  "FilterUser",
  "FilterComputer",
  "FilterOrgUnit",
  "FilterDomain",
  "FilterSite",
  "FilterOs",
  "FilterCpu",
  "FilterRam",
  "FilterDisk",
  "FilterIpRange",
  "FilterMacRange",
  "FilterDun",
  "FilterLanguage",
  "FilterBattery",
  "FilterPortable",
  "FilterPcmcia",
  "FilterProcMode",
  "FilterTerminal",
  "FilterTime",
  "FilterDate",
  "FilterVariable",
  "FilterFile",
  "FilterMsi",
  "FilterRegistry",
  "FilterLdap",
  "FilterWmi",
  "FilterCollection",
];

function filterKindLabel(kind: FilterKind, t: (key: string, fallback: string) => string): string {
  const map: Record<FilterKind, [string, string]> = {
    FilterSite: ["targeting.kind.site", "Site"],
    FilterGroup: ["targeting.kind.group", "Security Group"],
    FilterRunOnce: ["targeting.kind.runOnce", "Run Once"],
    FilterLdap: ["targeting.kind.ldap", "LDAP Query"],
    FilterBattery: ["targeting.kind.battery", "Battery Present"],
    FilterComputer: ["targeting.kind.computer", "Computer Name"],
    FilterCpu: ["targeting.kind.cpu", "CPU Speed"],
    FilterDate: ["targeting.kind.date", "Date Match"],
    FilterDun: ["targeting.kind.dun", "Dial-Up Connection"],
    FilterDisk: ["targeting.kind.disk", "Disk Space"],
    FilterDomain: ["targeting.kind.domain", "Domain"],
    FilterVariable: ["targeting.kind.variable", "Environment Variable"],
    FilterFile: ["targeting.kind.file", "File Match"],
    FilterIpRange: ["targeting.kind.ipRange", "IP Address Range"],
    FilterLanguage: ["targeting.kind.language", "Language"],
    FilterMacRange: ["targeting.kind.macRange", "MAC Address Range"],
    FilterMsi: ["targeting.kind.msi", "MSI Query"],
    FilterOs: ["targeting.kind.os", "Operating System"],
    FilterOrgUnit: ["targeting.kind.orgUnit", "Organizational Unit"],
    FilterPcmcia: ["targeting.kind.pcmcia", "PC Card (PCMCIA)"],
    FilterPortable: ["targeting.kind.portable", "Portable Computer"],
    FilterProcMode: ["targeting.kind.procMode", "Processing Mode"],
    FilterRam: ["targeting.kind.ram", "RAM"],
    FilterRegistry: ["targeting.kind.registry", "Registry Match"],
    FilterTerminal: ["targeting.kind.terminal", "Terminal Session"],
    FilterTime: ["targeting.kind.time", "Time Range"],
    FilterUser: ["targeting.kind.user", "User"],
    FilterWmi: ["targeting.kind.wmi", "WMI Query"],
    FilterCollection: ["targeting.kind.collection", "Item Collection (group)"],
  };
  const [key, fallback] = map[kind];
  return t(key, fallback);
}

function createDefaultFilter(kind: FilterKind): Filter {
  const base = { bool: "AND" as const, not: false };
  switch (kind) {
    case "FilterSite":
      return { ...base, kind, name: "" };
    case "FilterGroup":
      return { ...base, kind, name: "", userContext: true };
    case "FilterRunOnce":
      return { ...base, kind, id: crypto.randomUUID() };
    case "FilterLdap":
      return { ...base, kind, binding: "LDAP", searchFilter: "" };
    case "FilterBattery":
      return { ...base, kind };
    case "FilterComputer":
      return { ...base, kind, type: "NETBIOS", name: "" };
    case "FilterCpu":
      return { ...base, kind, speedMHz: 1000 };
    case "FilterDate":
      return { ...base, kind, period: "MONTHLY" };
    case "FilterDun":
      return { ...base, kind, type: "" };
    case "FilterDisk":
      return { ...base, kind, drive: "System", freeSpace: 0 };
    case "FilterDomain":
      return { ...base, kind, name: "", userContext: true };
    case "FilterVariable":
      return { ...base, kind, variableName: "" };
    case "FilterFile":
      return { ...base, kind, path: "", type: "EXISTS" };
    case "FilterIpRange":
      return { ...base, kind, min: "", max: "" };
    case "FilterLanguage":
      return { ...base, kind, language: 1033, locale: 1033 };
    case "FilterMacRange":
      return { ...base, kind, min: "", max: "" };
    case "FilterMsi":
      return { ...base, kind, type: "PRODUCT", subtype: "EXISTS" };
    case "FilterOs":
      return { ...base, kind };
    case "FilterOrgUnit":
      return { ...base, kind, name: "", userContext: true };
    case "FilterPcmcia":
      return { ...base, kind };
    case "FilterPortable":
      return { ...base, kind };
    case "FilterProcMode":
      return { ...base, kind };
    case "FilterRam":
      return { ...base, kind, totalMB: 1024 };
    case "FilterRegistry":
      return { ...base, kind, key: "", type: "KEYEXISTS", hive: "HKEY_LOCAL_MACHINE" };
    case "FilterTerminal":
      return { ...base, kind, type: "TS", option: "SESSION", value: "" };
    case "FilterTime":
      return { ...base, kind, begin: "08:00", end: "17:00" };
    case "FilterUser":
      return { ...base, kind, name: "" };
    case "FilterWmi":
      return { ...base, kind, query: "", nameSpace: "root\\cimv2" };
    case "FilterCollection":
      return { ...base, kind, filters: [] };
  }
}

// --- Path-addressed immutable tree helpers (a filter path is an array of indices, descending through FilterCollection.filters) ---

function insertAt(list: Filter[], parentPath: number[] | null, item: Filter): Filter[] {
  if (!parentPath) return [...list, item];
  return mutateAt(list, parentPath, (f) => (f.kind === "FilterCollection" ? { ...f, filters: [...f.filters, item] } : f)) as Filter[];
}

function mutateAt(list: Filter[], path: number[], fn: (f: Filter) => Filter): Filter[] {
  const [head, ...rest] = path;
  return list.map((f, i) => {
    if (i !== head) return f;
    if (rest.length === 0) return fn(f);
    if (f.kind !== "FilterCollection") return f;
    return { ...f, filters: mutateAt(f.filters, rest, fn) };
  });
}

function removeAt(list: Filter[], path: number[]): Filter[] {
  const [head, ...rest] = path;
  if (rest.length === 0) return list.filter((_, i) => i !== head);
  return list.map((f, i) => {
    if (i !== head || f.kind !== "FilterCollection") return f;
    return { ...f, filters: removeAt(f.filters, rest) };
  });
}

function moveAt(list: Filter[], path: number[], dir: -1 | 1): Filter[] {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    const target = head + dir;
    if (target < 0 || target >= list.length) return list;
    const copy = [...list];
    [copy[head], copy[target]] = [copy[target], copy[head]];
    return copy;
  }
  return list.map((f, i) => {
    if (i !== head || f.kind !== "FilterCollection") return f;
    return { ...f, filters: moveAt(f.filters, rest, dir) };
  });
}

function FilterRow({
  filter,
  path,
  isFirst,
  onUpdate,
  onRemove,
  onMove,
  onAddChild,
  newKind,
  setNewKind,
}: {
  filter: Filter;
  path: number[];
  isFirst: boolean;
  onUpdate: (path: number[], patch: Partial<Filter>) => void;
  onRemove: (path: number[]) => void;
  onMove: (path: number[], dir: -1 | 1) => void;
  onAddChild: (parentPath: number[]) => void;
  newKind: FilterKind;
  setNewKind: (k: FilterKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-sm border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!isFirst && (
          <WinSelect
            value={filter.bool}
            onChange={(e) => onUpdate(path, { bool: e.target.value as "AND" | "OR" })}
            className="!w-20"
          >
            <option value="AND">{t("targeting.and", "AND")}</option>
            <option value="OR">{t("targeting.or", "OR")}</option>
          </WinSelect>
        )}
        <WinSelect value={filter.not ? "1" : "0"} onChange={(e) => onUpdate(path, { not: e.target.value === "1" })} className="!w-24">
          <option value="0">{t("targeting.is", "Is")}</option>
          <option value="1">{t("targeting.isNot", "Is not")}</option>
        </WinSelect>
        <span className="font-medium text-slate-700 dark:text-slate-300">{filterKindLabel(filter.kind, t)}</span>
        <div className="ml-auto flex gap-1">
          <button className="text-xs text-slate-500 hover:underline dark:text-slate-400" onClick={() => onMove(path, -1)}>
            ▲
          </button>
          <button className="text-xs text-slate-500 hover:underline dark:text-slate-400" onClick={() => onMove(path, 1)}>
            ▼
          </button>
          <button className="text-xs text-red-600 hover:underline dark:text-red-400" onClick={() => onRemove(path)}>
            {t("fileShares.removeEntry", "Remove")}
          </button>
        </div>
      </div>

      <div className="mt-2">
        <FilterFields filter={filter} onChange={(patch) => onUpdate(path, patch)} />
      </div>

      {filter.kind === "FilterCollection" && (
        <div className="mt-2 space-y-2 border-l-2 border-slate-300 pl-3 dark:border-slate-600">
          {filter.filters.map((child, i) => (
            <FilterRow
              key={i}
              filter={child}
              path={[...path, i]}
              isFirst={i === 0}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onMove={onMove}
              onAddChild={onAddChild}
              newKind={newKind}
              setNewKind={setNewKind}
            />
          ))}
          <div className="flex items-center gap-2">
            <WinSelect value={newKind} onChange={(e) => setNewKind(e.target.value as FilterKind)} className="!w-48 text-xs">
              {FILTER_KINDS.filter((k) => k !== "FilterCollection").map((k) => (
                <option key={k} value={k}>
                  {filterKindLabel(k, t)}
                </option>
              ))}
            </WinSelect>
            <WindowsButton onClick={() => onAddChild(path)}>{t("targeting.addToGroup", "Add to Group")}</WindowsButton>
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders the type-specific parameter fields for a single filter (everything except FilterCollection, whose children render as nested rows). */
function FilterFields({ filter, onChange }: { filter: Filter; onChange: (patch: Partial<Filter>) => void }) {
  const { t } = useTranslation();
  const f = filter as never as Record<string, unknown>;
  const set = (key: string, value: unknown) => onChange({ [key]: value } as Partial<Filter>);
  const row = "grid grid-cols-2 gap-2 sm:grid-cols-3";

  switch (filter.kind) {
    case "FilterGroup":
      return (
        <div className={row}>
          <Field label={t("targeting.field.name", "Name")}>
            <WinInput value={filter.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="DOMAIN\Group Name" />
          </Field>
          <BoolField label={t("targeting.field.userContext", "Applies to user (not computer)")} value={filter.userContext} onChange={(v) => set("userContext", v)} />
        </div>
      );
    case "FilterUser":
      return (
        <Field label={t("targeting.field.name", "Name")}>
          <WinInput value={filter.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="DOMAIN\username" />
        </Field>
      );
    case "FilterComputer":
      return (
        <div className={row}>
          <Field label={t("targeting.field.name", "Name")}>
            <WinInput value={filter.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label={t("targeting.field.type", "Type")}>
            <WinSelect value={filter.type} onChange={(e) => set("type", e.target.value)}>
              <option value="NETBIOS">NetBIOS</option>
              <option value="DNS">DNS/FQDN</option>
            </WinSelect>
          </Field>
        </div>
      );
    case "FilterOrgUnit":
      return (
        <div className={row}>
          <Field label={t("targeting.field.name", "Name")}>
            <WinInput value={filter.name} onChange={(e) => set("name", e.target.value)} placeholder="OU=Sales,DC=example,DC=com" />
          </Field>
          <BoolField label={t("targeting.field.userContext", "Applies to user (not computer)")} value={filter.userContext} onChange={(v) => set("userContext", v)} />
          <BoolField label={t("targeting.field.directMember", "Direct member only")} value={filter.directMember} onChange={(v) => set("directMember", v)} />
        </div>
      );
    case "FilterDomain":
      return (
        <div className={row}>
          <Field label={t("targeting.field.name", "Name")}>
            <WinInput value={filter.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <BoolField label={t("targeting.field.userContext", "Applies to user (not computer)")} value={filter.userContext} onChange={(v) => set("userContext", v)} />
        </div>
      );
    case "FilterSite":
      return (
        <Field label={t("targeting.field.name", "Name")}>
          <WinInput value={filter.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
      );
    case "FilterOs":
      return (
        <div className={row}>
          <Field label={t("targeting.field.osVersion", "Version")}>
            <WinSelect value={filter.version ?? "NE"} onChange={(e) => set("version", e.target.value)}>
              {["NE", "XP", "VISTA", "2K8", "WIN7", "2K8R2", "WIN8", "WINBLUE", "WINTHRESHOLD"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </WinSelect>
          </Field>
          <Field label={t("targeting.field.osType", "Product type")}>
            <WinSelect value={filter.type ?? "NE"} onChange={(e) => set("type", e.target.value)}>
              {["NE", "WS", "SV", "DC", "PRO"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </WinSelect>
          </Field>
        </div>
      );
    case "FilterCpu":
      return (
        <Field label={t("targeting.field.speedMHz", "Minimum speed (MHz)")}>
          <WinInput type="number" value={filter.speedMHz} onChange={(e) => set("speedMHz", Number(e.target.value))} />
        </Field>
      );
    case "FilterRam":
      return (
        <Field label={t("targeting.field.totalMB", "Minimum RAM (MB)")}>
          <WinInput type="number" value={filter.totalMB} onChange={(e) => set("totalMB", Number(e.target.value))} />
        </Field>
      );
    case "FilterDisk":
      return (
        <div className={row}>
          <Field label={t("targeting.field.drive", "Drive")}>
            <WinInput value={filter.drive} onChange={(e) => set("drive", e.target.value)} placeholder="System" />
          </Field>
          <Field label={t("targeting.field.freeSpace", "Minimum free space (KB)")}>
            <WinInput type="number" value={filter.freeSpace} onChange={(e) => set("freeSpace", Number(e.target.value))} />
          </Field>
        </div>
      );
    case "FilterIpRange":
      return (
        <div className={row}>
          <Field label={t("targeting.field.min", "Minimum")}>
            <WinInput value={filter.min} onChange={(e) => set("min", e.target.value)} placeholder="10.10.10.10" />
          </Field>
          <Field label={t("targeting.field.max", "Maximum")}>
            <WinInput value={filter.max} onChange={(e) => set("max", e.target.value)} placeholder="10.10.10.50" />
          </Field>
        </div>
      );
    case "FilterMacRange":
      return (
        <div className={row}>
          <Field label={t("targeting.field.min", "Minimum")}>
            <WinInput value={filter.min} onChange={(e) => set("min", e.target.value)} placeholder="00:00:00:00:00:00" />
          </Field>
          <Field label={t("targeting.field.max", "Maximum")}>
            <WinInput value={filter.max} onChange={(e) => set("max", e.target.value)} placeholder="ff:ff:ff:ff:ff:ff" />
          </Field>
        </div>
      );
    case "FilterDun":
      return (
        <Field label={t("targeting.field.type", "Type")}>
          <WinSelect value={filter.type} onChange={(e) => set("type", e.target.value)}>
            {["", "modem", "isdn", "vpn", "GENERIC", "SERIAL", "PPPoE"].map((v) => (
              <option key={v} value={v}>
                {v || t("targeting.field.anyConnection", "Any connection")}
              </option>
            ))}
          </WinSelect>
        </Field>
      );
    case "FilterLanguage":
      return (
        <div className={row}>
          <Field label={t("targeting.field.language", "Language ID")}>
            <WinInput type="number" value={filter.language} onChange={(e) => set("language", Number(e.target.value))} />
          </Field>
          <Field label={t("targeting.field.locale", "Locale ID")}>
            <WinInput type="number" value={filter.locale} onChange={(e) => set("locale", Number(e.target.value))} />
          </Field>
        </div>
      );
    case "FilterBattery":
    case "FilterPcmcia":
      return <p className="text-xs text-slate-500 dark:text-slate-400">{t("targeting.field.noSettings", "No settings for this item.")}</p>;
    case "FilterPortable":
      return (
        <div className={row}>
          <BoolField label={t("targeting.field.docked", "Docked")} value={filter.docked} onChange={(v) => set("docked", v)} />
          <BoolField label={t("targeting.field.undocked", "Undocked")} value={filter.undocked} onChange={(v) => set("undocked", v)} />
        </div>
      );
    case "FilterProcMode":
      return (
        <div className={row}>
          <BoolField label={t("targeting.field.slowLink", "Slow network connection")} value={filter.slowLink} onChange={(v) => set("slowLink", v)} />
          <BoolField label={t("targeting.field.backRefr", "Background refresh")} value={filter.backRefr} onChange={(v) => set("backRefr", v)} />
        </div>
      );
    case "FilterTerminal":
      return (
        <div className={row}>
          <Field label={t("targeting.field.type", "Type")}>
            <WinSelect value={filter.type} onChange={(e) => set("type", e.target.value)}>
              <option value="TS">{t("targeting.field.terminalSession", "Terminal Server session")}</option>
              <option value="CONSOLE">{t("targeting.field.consoleSession", "Console session")}</option>
              <option value="NE">{t("targeting.field.notApplicable", "Not applicable")}</option>
            </WinSelect>
          </Field>
        </div>
      );
    case "FilterTime":
      return (
        <div className={row}>
          <Field label={t("targeting.field.begin", "Start time")}>
            <WinInput value={filter.begin} onChange={(e) => set("begin", e.target.value)} placeholder="08:00" />
          </Field>
          <Field label={t("targeting.field.end", "End time")}>
            <WinInput value={filter.end} onChange={(e) => set("end", e.target.value)} placeholder="17:00" />
          </Field>
        </div>
      );
    case "FilterDate":
      return (
        <div className={row}>
          <Field label={t("targeting.field.period", "Period")}>
            <WinSelect value={filter.period} onChange={(e) => set("period", e.target.value)}>
              <option value="MONTHLY">{t("targeting.field.monthly", "Monthly")}</option>
              <option value="WEEKLY">{t("targeting.field.weekly", "Weekly")}</option>
              <option value="YEARLY">{t("targeting.field.yearly", "Yearly")}</option>
            </WinSelect>
          </Field>
        </div>
      );
    case "FilterVariable":
      return (
        <div className={row}>
          <Field label={t("targeting.field.variableName", "Variable name")}>
            <WinInput value={filter.variableName} onChange={(e) => set("variableName", e.target.value)} />
          </Field>
          <Field label={t("targeting.field.value", "Value")}>
            <WinInput value={filter.value ?? ""} onChange={(e) => set("value", e.target.value)} />
          </Field>
        </div>
      );
    case "FilterFile":
      return (
        <div className={row}>
          <Field label={t("targeting.field.path", "Path")}>
            <WinInput value={filter.path} onChange={(e) => set("path", e.target.value)} />
          </Field>
          <Field label={t("targeting.field.type", "Type")}>
            <WinSelect value={filter.type ?? "EXISTS"} onChange={(e) => set("type", e.target.value)}>
              <option value="EXISTS">{t("targeting.field.exists", "Exists")}</option>
              <option value="VERSION">{t("targeting.field.version", "Version")}</option>
            </WinSelect>
          </Field>
        </div>
      );
    case "FilterMsi":
      return (
        <div className={row}>
          <Field label={t("targeting.field.type", "Type")}>
            <WinSelect value={filter.type} onChange={(e) => set("type", e.target.value)}>
              <option value="PRODUCT">Product</option>
              <option value="PATCH">Patch</option>
              <option value="FILECOMPONENT">File component</option>
            </WinSelect>
          </Field>
          <Field label={t("targeting.field.code", "Product code")}>
            <WinInput value={filter.code ?? ""} onChange={(e) => set("code", e.target.value)} />
          </Field>
        </div>
      );
    case "FilterRegistry":
      return (
        <div className={row}>
          <Field label={t("targeting.field.hive", "Hive")}>
            <WinSelect value={filter.hive ?? "HKEY_LOCAL_MACHINE"} onChange={(e) => set("hive", e.target.value)}>
              <option value="HKEY_LOCAL_MACHINE">HKEY_LOCAL_MACHINE</option>
              <option value="HKEY_CURRENT_USER">HKEY_CURRENT_USER</option>
              <option value="HKEY_CLASSES_ROOT">HKEY_CLASSES_ROOT</option>
            </WinSelect>
          </Field>
          <Field label={t("targeting.field.key", "Key")}>
            <WinInput value={filter.key} onChange={(e) => set("key", e.target.value)} />
          </Field>
          <Field label={t("targeting.field.valueName", "Value name")}>
            <WinInput value={filter.valueName ?? ""} onChange={(e) => set("valueName", e.target.value)} />
          </Field>
        </div>
      );
    case "FilterLdap":
      return (
        <div className={row}>
          <Field label={t("targeting.field.searchFilter", "LDAP search filter")}>
            <WinInput value={filter.searchFilter ?? ""} onChange={(e) => set("searchFilter", e.target.value)} placeholder="(objectClass=user)" />
          </Field>
          <Field label={t("targeting.field.binding", "Binding")}>
            <WinInput value={filter.binding} onChange={(e) => set("binding", e.target.value)} placeholder="LDAP://..." />
          </Field>
        </div>
      );
    case "FilterWmi":
      return (
        <div className={row}>
          <Field label={t("targeting.field.query", "WQL query")}>
            <WinInput value={filter.query} onChange={(e) => set("query", e.target.value)} placeholder="select * from Win32_Bios" />
          </Field>
          <Field label={t("targeting.field.namespace", "Namespace")}>
            <WinInput value={filter.nameSpace ?? "root\\cimv2"} onChange={(e) => set("nameSpace", e.target.value)} />
          </Field>
        </div>
      );
    case "FilterRunOnce":
      return <p className="text-xs text-slate-500 dark:text-slate-400">{t("targeting.field.runOnceHint", "Managed automatically by \"Apply once and do not reapply\".")}</p>;
    case "FilterCollection":
      return null;
    default:
      void f;
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <WinLabel>{label}</WinLabel>
      {children}
    </div>
  );
}

function BoolField({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return <WinCheckbox label={label} checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
}
