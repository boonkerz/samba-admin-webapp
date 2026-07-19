import { randomUUID } from "node:crypto";
import type { CommonItemOptions, Filter, FilterBoolOp } from "@samba-admin/shared";
import { parseXmlFragment, serializeXmlElement, type XmlElement } from "./xmlMini.js";

/**
 * Filter <-> XML conversion for GPP's item-level targeting `<Filters>`
 * block, and the item-level "Common Options" attributes (bypassErrors/
 * userContext/removePolicy/desc). Schema verified against Microsoft's
 * published [MS-GPPREF] documentation (Common XML Schema + Targeting
 * sections) — see shared/src/types/gpp-common.ts for the full citation.
 */

function boolAttr(attrs: Record<string, string>, key: string): boolean | undefined {
  return key in attrs ? attrs[key] === "1" : undefined;
}

function numAttr(attrs: Record<string, string>, key: string): number | undefined {
  return key in attrs ? Number(attrs[key]) : undefined;
}

function setBool(attrs: Record<string, string>, key: string, value: boolean | undefined): void {
  if (value !== undefined) attrs[key] = value ? "1" : "0";
}

function setStr(attrs: Record<string, string>, key: string, value: string | undefined): void {
  if (value !== undefined) attrs[key] = value;
}

function setNum(attrs: Record<string, string>, key: string, value: number | undefined): void {
  if (value !== undefined) attrs[key] = String(value);
}

function parseFilterElement(el: XmlElement): Filter {
  const bool: FilterBoolOp = el.attrs.bool === "OR" ? "OR" : "AND";
  const not = el.attrs.not === "1";
  const hidden = boolAttr(el.attrs, "hidden");
  const base = { bool, not, ...(hidden !== undefined ? { hidden } : {}) };
  const a = el.attrs;

  switch (el.tag) {
    case "FilterSite":
      return { ...base, kind: "FilterSite", name: a.name ?? "" };
    case "FilterGroup":
      return {
        ...base,
        kind: "FilterGroup",
        name: a.name,
        sid: a.sid,
        userContext: boolAttr(a, "userContext"),
        primaryGroup: boolAttr(a, "primaryGroup"),
        localGroup: boolAttr(a, "localGroup"),
      };
    case "FilterRunOnce":
      return { ...base, kind: "FilterRunOnce", id: a.id ?? randomUUID(), userContext: boolAttr(a, "userContext"), comments: a.comments };
    case "FilterLdap":
      return { ...base, kind: "FilterLdap", searchFilter: a.searchFilter, binding: a.binding ?? "LDAP", variableName: a.variableName, attribute: a.attribute };
    case "FilterBattery":
      return { ...base, kind: "FilterBattery" };
    case "FilterComputer":
      return { ...base, kind: "FilterComputer", type: a.type === "DNS" ? "DNS" : "NETBIOS", name: a.name ?? "" };
    case "FilterCpu":
      return { ...base, kind: "FilterCpu", speedMHz: numAttr(a, "speedMHz") ?? 0 };
    case "FilterDate":
      return {
        ...base,
        kind: "FilterDate",
        period: (a.period as "MONTHLY" | "WEEKLY" | "YEARLY") ?? "MONTHLY",
        dow: a.dow as never,
        day: numAttr(a, "day"),
        month: numAttr(a, "month"),
        year: numAttr(a, "year"),
      };
    case "FilterDun":
      return { ...base, kind: "FilterDun", type: (a.type as never) ?? "" };
    case "FilterDisk":
      return { ...base, kind: "FilterDisk", freeSpace: numAttr(a, "freeSpace") ?? 0, drive: a.drive ?? "System" };
    case "FilterDomain":
      return { ...base, kind: "FilterDomain", name: a.name ?? "", userContext: boolAttr(a, "userContext") };
    case "FilterVariable":
      return { ...base, kind: "FilterVariable", variableName: a.variableName ?? "", value: a.value };
    case "FilterFile":
      return {
        ...base,
        kind: "FilterFile",
        gte: boolAttr(a, "gte"),
        lte: boolAttr(a, "lte"),
        min: a.min,
        max: a.max,
        path: a.path ?? "",
        type: a.type as never,
        folder: boolAttr(a, "folder"),
      };
    case "FilterIpRange":
      return { ...base, kind: "FilterIpRange", min: a.min ?? "", max: a.max ?? "" };
    case "FilterLanguage":
      return {
        ...base,
        kind: "FilterLanguage",
        default: boolAttr(a, "default"),
        system: boolAttr(a, "system"),
        native: boolAttr(a, "native"),
        displayName: a.displayName,
        language: numAttr(a, "language") ?? 0,
        locale: numAttr(a, "locale") ?? 0,
      };
    case "FilterMacRange":
      return { ...base, kind: "FilterMacRange", min: a.min ?? "", max: a.max ?? "" };
    case "FilterMsi":
      return {
        ...base,
        kind: "FilterMsi",
        type: (a.type as never) ?? "PRODUCT",
        subtype: (a.subtype as never) ?? "EXISTS",
        code: a.code,
        item: a.item,
        value: a.value,
        min: a.min,
        max: a.max,
        gte: boolAttr(a, "gte"),
        lte: boolAttr(a, "lte"),
      };
    case "FilterOs":
      return { ...base, kind: "FilterOs", class: a.class as never, version: a.version as never, type: a.type as never, edition: a.edition as never, sp: a.sp as never };
    case "FilterOrgUnit":
      return { ...base, kind: "FilterOrgUnit", name: a.name ?? "", userContext: boolAttr(a, "userContext"), directMember: boolAttr(a, "directMember") };
    case "FilterPcmcia":
      return { ...base, kind: "FilterPcmcia" };
    case "FilterPortable":
      return { ...base, kind: "FilterPortable", unknown: boolAttr(a, "unknown"), docked: boolAttr(a, "docked"), undocked: boolAttr(a, "undocked") };
    case "FilterProcMode":
      return {
        ...base,
        kind: "FilterProcMode",
        synchFore: boolAttr(a, "synchFore"),
        asynchFore: boolAttr(a, "asynchFore"),
        backRefr: boolAttr(a, "backRefr"),
        forceRefr: boolAttr(a, "forceRefr"),
        linkTrns: boolAttr(a, "linkTrns"),
        noChg: boolAttr(a, "noChg"),
        rsopTrns: boolAttr(a, "rsopTrns"),
        safeBoot: boolAttr(a, "safeBoot"),
        slowLink: boolAttr(a, "slowLink"),
        verbLog: boolAttr(a, "verbLog"),
        rsopEnbl: boolAttr(a, "rsopEnbl"),
      };
    case "FilterRam":
      return { ...base, kind: "FilterRam", totalMB: numAttr(a, "totalMB") ?? 0 };
    case "FilterRegistry":
      return {
        ...base,
        kind: "FilterRegistry",
        type: a.type as never,
        subtype: a.subtype as never,
        valueName: a.valueName,
        valueType: a.valueType as never,
        valueData: a.valueData,
        variableName: a.variableName,
        key: a.key ?? "",
        hive: a.hive as never,
        min: a.min,
        max: a.max,
        gte: boolAttr(a, "gte"),
        lte: boolAttr(a, "lte"),
        version: a.version,
      };
    case "FilterTerminal":
      return {
        ...base,
        kind: "FilterTerminal",
        type: (a.type as never) ?? "NE",
        option: (a.option as never) ?? "SESSION",
        value: a.value ?? "",
        min: a.min,
        max: a.max,
      };
    case "FilterTime":
      return { ...base, kind: "FilterTime", begin: a.begin ?? "00:00", end: a.end ?? "23:59" };
    case "FilterUser":
      return { ...base, kind: "FilterUser", name: a.name, sid: a.sid };
    case "FilterWmi":
      return { ...base, kind: "FilterWmi", query: a.query ?? "", nameSpace: a.nameSpace, property: a.property, variableName: a.variableName };
    case "FilterCollection":
      return { ...base, kind: "FilterCollection", name: a.name, filters: el.children.map(parseFilterElement) };
    default:
      throw new Error(`Unknown item-level targeting filter element: <${el.tag}>`);
  }
}

function filterToXmlElement(f: Filter): XmlElement {
  const attrs: Record<string, string> = { bool: f.bool, not: f.not ? "1" : "0" };
  if (f.hidden !== undefined) attrs.hidden = f.hidden ? "1" : "0";

  switch (f.kind) {
    case "FilterSite":
      setStr(attrs, "name", f.name);
      break;
    case "FilterGroup":
      setStr(attrs, "name", f.name);
      setStr(attrs, "sid", f.sid);
      setBool(attrs, "userContext", f.userContext);
      setBool(attrs, "primaryGroup", f.primaryGroup);
      setBool(attrs, "localGroup", f.localGroup);
      break;
    case "FilterRunOnce":
      setStr(attrs, "id", f.id);
      setBool(attrs, "userContext", f.userContext);
      setStr(attrs, "comments", f.comments);
      break;
    case "FilterLdap":
      setStr(attrs, "searchFilter", f.searchFilter);
      setStr(attrs, "binding", f.binding);
      setStr(attrs, "variableName", f.variableName);
      setStr(attrs, "attribute", f.attribute);
      break;
    case "FilterBattery":
    case "FilterPcmcia":
      break;
    case "FilterComputer":
      setStr(attrs, "type", f.type);
      setStr(attrs, "name", f.name);
      break;
    case "FilterCpu":
      setNum(attrs, "speedMHz", f.speedMHz);
      break;
    case "FilterDate":
      setStr(attrs, "period", f.period);
      setStr(attrs, "dow", f.dow);
      setNum(attrs, "day", f.day);
      setNum(attrs, "month", f.month);
      setNum(attrs, "year", f.year);
      break;
    case "FilterDun":
      setStr(attrs, "type", f.type);
      break;
    case "FilterDisk":
      setNum(attrs, "freeSpace", f.freeSpace);
      setStr(attrs, "drive", f.drive);
      break;
    case "FilterDomain":
      setStr(attrs, "name", f.name);
      setBool(attrs, "userContext", f.userContext);
      break;
    case "FilterVariable":
      setStr(attrs, "variableName", f.variableName);
      setStr(attrs, "value", f.value);
      break;
    case "FilterFile":
      setBool(attrs, "gte", f.gte);
      setBool(attrs, "lte", f.lte);
      setStr(attrs, "min", f.min);
      setStr(attrs, "max", f.max);
      setStr(attrs, "path", f.path);
      setStr(attrs, "type", f.type);
      setBool(attrs, "folder", f.folder);
      break;
    case "FilterIpRange":
      setStr(attrs, "min", f.min);
      setStr(attrs, "max", f.max);
      break;
    case "FilterLanguage":
      setBool(attrs, "default", f.default);
      setBool(attrs, "system", f.system);
      setBool(attrs, "native", f.native);
      setStr(attrs, "displayName", f.displayName);
      setNum(attrs, "language", f.language);
      setNum(attrs, "locale", f.locale);
      break;
    case "FilterMacRange":
      setStr(attrs, "min", f.min);
      setStr(attrs, "max", f.max);
      break;
    case "FilterMsi":
      setStr(attrs, "type", f.type);
      setStr(attrs, "subtype", f.subtype);
      setStr(attrs, "code", f.code);
      setStr(attrs, "item", f.item);
      setStr(attrs, "value", f.value);
      setStr(attrs, "min", f.min);
      setStr(attrs, "max", f.max);
      setBool(attrs, "gte", f.gte);
      setBool(attrs, "lte", f.lte);
      break;
    case "FilterOs":
      setStr(attrs, "class", f.class);
      setStr(attrs, "version", f.version);
      setStr(attrs, "type", f.type);
      setStr(attrs, "edition", f.edition);
      setStr(attrs, "sp", f.sp);
      break;
    case "FilterOrgUnit":
      setStr(attrs, "name", f.name);
      setBool(attrs, "userContext", f.userContext);
      setBool(attrs, "directMember", f.directMember);
      break;
    case "FilterPortable":
      setBool(attrs, "unknown", f.unknown);
      setBool(attrs, "docked", f.docked);
      setBool(attrs, "undocked", f.undocked);
      break;
    case "FilterProcMode":
      setBool(attrs, "synchFore", f.synchFore);
      setBool(attrs, "asynchFore", f.asynchFore);
      setBool(attrs, "backRefr", f.backRefr);
      setBool(attrs, "forceRefr", f.forceRefr);
      setBool(attrs, "linkTrns", f.linkTrns);
      setBool(attrs, "noChg", f.noChg);
      setBool(attrs, "rsopTrns", f.rsopTrns);
      setBool(attrs, "safeBoot", f.safeBoot);
      setBool(attrs, "slowLink", f.slowLink);
      setBool(attrs, "verbLog", f.verbLog);
      setBool(attrs, "rsopEnbl", f.rsopEnbl);
      break;
    case "FilterRam":
      setNum(attrs, "totalMB", f.totalMB);
      break;
    case "FilterRegistry":
      setStr(attrs, "type", f.type);
      setStr(attrs, "subtype", f.subtype);
      setStr(attrs, "valueName", f.valueName);
      setStr(attrs, "valueType", f.valueType);
      setStr(attrs, "valueData", f.valueData);
      setStr(attrs, "variableName", f.variableName);
      setStr(attrs, "key", f.key);
      setStr(attrs, "hive", f.hive);
      setStr(attrs, "min", f.min);
      setStr(attrs, "max", f.max);
      setBool(attrs, "gte", f.gte);
      setBool(attrs, "lte", f.lte);
      setStr(attrs, "version", f.version);
      break;
    case "FilterTerminal":
      setStr(attrs, "type", f.type);
      setStr(attrs, "option", f.option);
      setStr(attrs, "value", f.value);
      setStr(attrs, "min", f.min);
      setStr(attrs, "max", f.max);
      break;
    case "FilterTime":
      setStr(attrs, "begin", f.begin);
      setStr(attrs, "end", f.end);
      break;
    case "FilterUser":
      setStr(attrs, "name", f.name);
      setStr(attrs, "sid", f.sid);
      break;
    case "FilterWmi":
      setStr(attrs, "query", f.query);
      setStr(attrs, "nameSpace", f.nameSpace);
      setStr(attrs, "property", f.property);
      setStr(attrs, "variableName", f.variableName);
      break;
    case "FilterCollection":
      setStr(attrs, "name", f.name);
      return { tag: f.kind, attrs, children: f.filters.map(filterToXmlElement) };
  }
  return { tag: f.kind, attrs, children: [] };
}

/** Parses a `<Filters>...</Filters>` block's inner content (or an empty string) into the flat top-level filter list. */
export function parseFilters(filtersInnerXml: string | undefined): Filter[] {
  if (!filtersInnerXml?.trim()) return [];
  return parseXmlFragment(filtersInnerXml).map(parseFilterElement);
}

/** Serializes the top-level filter list back into a `<Filters>...</Filters>` block, or "" if there are none (Filters is an optional element). */
export function buildFiltersXml(filters: Filter[]): string {
  if (filters.length === 0) return "";
  return `<Filters>${filters.map((f) => serializeXmlElement(filterToXmlElement(f))).join("")}</Filters>`;
}

const RUN_ONCE_KIND = "FilterRunOnce" as const;

/** Adds/removes the FilterRunOnce entry that backs the Common tab's "Apply once and do not reapply" checkbox, preserving its id across edits so a previously-applied item isn't reapplied just because the item was edited. */
export function withApplyOnce(filters: Filter[], applyOnce: boolean): Filter[] {
  const existing = filters.find((f): f is Filter & { kind: "FilterRunOnce" } => f.kind === RUN_ONCE_KIND);
  if (!applyOnce) return filters.filter((f) => f.kind !== RUN_ONCE_KIND);
  if (existing) return filters;
  return [...filters, { kind: RUN_ONCE_KIND, bool: "AND", not: false, id: randomUUID() }];
}

export function hasApplyOnce(filters: Filter[]): boolean {
  return filters.some((f) => f.kind === RUN_ONCE_KIND);
}

/**
 * Common item XML attributes (bypassErrors/userContext/removePolicy/desc) —
 * siblings of <Properties>/<Filters> on the item element, not part of
 * either. `attrs` here is the already-parsed attribute map of the item
 * element (e.g. `<Drive ...>`), from whatever regex/parsing each
 * gpp-*.service.ts already uses to read that element's own opening tag.
 */
export function parseCommonAttrs(attrs: Record<string, string | undefined>): Pick<CommonItemOptions, "stopOnError" | "runInUserContext" | "removeWhenNotApplied" | "description"> {
  return {
    // bypassErrors defaults to true (continue on error) when absent, matching Windows' own default (checkbox unchecked).
    stopOnError: attrs.bypassErrors === "0",
    runInUserContext: attrs.userContext === "1",
    removeWhenNotApplied: attrs.removePolicy === "1",
    description: attrs.desc ?? "",
  };
}

export function buildCommonAttrs(opts: Pick<CommonItemOptions, "stopOnError" | "runInUserContext" | "removeWhenNotApplied" | "description">): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Only emit bypassErrors when stopping on error is requested — omitting it
  // matches Windows' own output for the (checkbox-unchecked) default case.
  if (opts.stopOnError) attrs.bypassErrors = "0";
  if (opts.runInUserContext) attrs.userContext = "1";
  if (opts.removeWhenNotApplied) attrs.removePolicy = "1";
  if (opts.description) attrs.desc = opts.description;
  return attrs;
}
