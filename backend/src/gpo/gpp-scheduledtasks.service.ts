import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type ldap from "ldapjs";
import type { ScheduledTaskPreference, TaskTrigger, TaskAction, TaskPrincipal, TaskSettings, Weekday, MonthName } from "@samba-admin/shared";
import { getSysvolPath, bumpGpoVersion, fixNewSysvolDirAcl } from "./gpo-editor.service.js";
import { search, modify, buildChange, attrString } from "../directory/ldapClient.js";

// GPP Scheduled Tasks (TaskV2/ImmediateTaskV2) CLSIDs, from the official
// [MS-GPPREF] ScheduledTasks XML example.
const SCHEDULED_TASKS_CLSID = "{CC63F200-7309-4ba0-B154-A71CD118DBCC}";
const TASKV2_CLSID = "{D8896631-B747-47a7-84A6-C155337F3BC8}";
const IMMEDIATE_TASKV2_CLSID = "{9756B581-76EC-4169-9AFC-0CA8D43ADB5F}";

// CSE + tool extension GUID pair, from [MS-GPPREF]'s Standards Assignments table.
const TASKS_CSE_GUID = "{AADCED64-746C-4633-A97C-D61349046527}";
const TASKS_TOOL_GUID = "{CAB54552-DEEA-4691-817E-ED4A4D1AFC72}";

type Scope = "machine" | "user";

function getTasksXmlPath(domainDn: string, guid: string, scope: Scope): string {
  const scopeDir = scope === "machine" ? "Machine" : "User";
  return path.join(getSysvolPath(domainDn), `{${guid}}`, scopeDir, "Preferences", "ScheduledTasks", "ScheduledTasks.xml");
}

function extensionAttrForScope(scope: Scope): "gPCMachineExtensionNames" | "gPCUserExtensionNames" {
  return scope === "machine" ? "gPCMachineExtensionNames" : "gPCUserExtensionNames";
}

function parseExtensionGroups(value: string): string[][] {
  const groups: string[][] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    groups.push(m[1].match(/\{[0-9A-Fa-f-]+\}/g) ?? []);
  }
  return groups;
}

function serializeExtensionGroups(groups: string[][]): string {
  return groups.map((g) => `[${g.join("")}]`).join("");
}

async function ensureTasksCseRegistered(client: ldap.Client, gpoDn: string, scope: Scope): Promise<void> {
  const attrName = extensionAttrForScope(scope);
  const entries = await search(client, gpoDn, { scope: "base", filter: "(objectClass=*)", attributes: [attrName] });
  const current = attrString(entries[0]?.attributes ?? {}, attrName) ?? "";
  const groups = parseExtensionGroups(current);

  if (groups.some((g) => g[0]?.toUpperCase() === TASKS_CSE_GUID.toUpperCase())) return;

  groups.push([TASKS_CSE_GUID, TASKS_TOOL_GUID]);
  groups.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

  await modify(client, gpoDn, [buildChange("replace", attrName, serializeExtensionGroups(groups))]);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeXml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

function extractAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) attrs[m[1]] = unescapeXml(m[2]);
  return attrs;
}

/** Extracts the first `<Tag ...>...</Tag>` or self-closing `<Tag .../>` at this level. */
function extractElement(content: string, tag: string): { attrs: Record<string, string>; inner: string } | undefined {
  const paired = new RegExp(`<${tag}\\b([^>]*?)(?<!/)>([\\s\\S]*?)</${tag}>`).exec(content);
  if (paired) return { attrs: extractAttrs(paired[1]), inner: paired[2] };
  const selfClosing = new RegExp(`<${tag}\\b([^>]*)/>`).exec(content);
  if (selfClosing) return { attrs: extractAttrs(selfClosing[1]), inner: "" };
  return undefined;
}

/** Extracts the text content of a simple leaf element like `<Author>foo</Author>`. Returns undefined if absent. */
function extractText(content: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(content);
  return m ? unescapeXml(m[1]) : undefined;
}

/** Whether a fixed-empty flag element like `<Monday/>` is present. */
function hasFlag(content: string, tag: string): boolean {
  return new RegExp(`<${tag}\\s*/>`).test(content);
}

// --- ISO 8601 duration helpers (Task Scheduler settings/triggers use these, e.g. "P3D", "PT10M") ---

function minutesToDuration(totalMinutes: number | undefined): string | undefined {
  if (totalMinutes === undefined || totalMinutes <= 0) return undefined;
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  let out = "P";
  if (days > 0) out += `${days}D`;
  if (hours > 0 || minutes > 0) {
    out += "T";
    if (hours > 0) out += `${hours}H`;
    if (minutes > 0) out += `${minutes}M`;
  }
  return out === "P" ? undefined : out;
}

function durationToMinutes(duration: string | undefined): number | undefined {
  if (!duration) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration);
  if (!m) return undefined;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  const total = days * 1440 + hours * 60 + minutes;
  return total > 0 ? total : undefined;
}

function boolText(v: boolean): string {
  return v ? "true" : "false";
}

// --- Triggers ---

const WEEKDAYS: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS: MonthName[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]; // prettier-ignore

function parseTriggerBase(inner: string): {
  enabled: boolean;
  startBoundary?: string;
  endBoundary?: string;
  repeatEveryMinutes?: number;
  repeatForMinutes?: number;
  executionTimeLimitMinutes?: number;
} {
  const repetition = extractElement(inner, "Repetition");
  return {
    enabled: extractText(inner, "Enabled") !== "false",
    startBoundary: extractText(inner, "StartBoundary"),
    endBoundary: extractText(inner, "EndBoundary"),
    repeatEveryMinutes: repetition ? durationToMinutes(extractText(repetition.inner, "Interval")) : undefined,
    repeatForMinutes: repetition ? durationToMinutes(extractText(repetition.inner, "Duration")) : undefined,
    executionTimeLimitMinutes: durationToMinutes(extractText(inner, "ExecutionTimeLimit")),
  };
}

function buildTriggerBase(t: TaskTrigger): string {
  let xml = `<Enabled>${boolText(t.enabled)}</Enabled>`;
  if (t.startBoundary) xml += `<StartBoundary>${escapeXml(t.startBoundary)}</StartBoundary>`;
  if (t.endBoundary) xml += `<EndBoundary>${escapeXml(t.endBoundary)}</EndBoundary>`;
  if (t.repeatEveryMinutes) {
    xml += "<Repetition>";
    xml += `<Interval>${minutesToDuration(t.repeatEveryMinutes)}</Interval>`;
    const dur = minutesToDuration(t.repeatForMinutes);
    if (dur) xml += `<Duration>${dur}</Duration>`;
    xml += "</Repetition>";
  }
  if (t.executionTimeLimitMinutes) {
    xml += `<ExecutionTimeLimit>${minutesToDuration(t.executionTimeLimitMinutes)}</ExecutionTimeLimit>`;
  }
  return xml;
}

function parseTriggers(tasksInner: string): TaskTrigger[] {
  const triggersEl = extractElement(tasksInner, "Triggers");
  if (!triggersEl) return [];
  const triggers: TaskTrigger[] = [];

  const elementRe = /<(BootTrigger|RegistrationTrigger|IdleTrigger|TimeTrigger|LogonTrigger|SessionStateChangeTrigger|CalendarTrigger)\b([^>]*?)(?<!\/)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(triggersEl.inner)) !== null) {
    const [, tag, , inner] = match;
    const base = { uid: crypto.randomUUID(), ...parseTriggerBase(inner) };

    if (tag === "BootTrigger") {
      triggers.push({ ...base, type: "boot", delayMinutes: durationToMinutes(extractText(inner, "Delay")) });
    } else if (tag === "RegistrationTrigger") {
      triggers.push({ ...base, type: "registration", delayMinutes: durationToMinutes(extractText(inner, "Delay")) });
    } else if (tag === "IdleTrigger") {
      triggers.push({ ...base, type: "idle" });
    } else if (tag === "TimeTrigger") {
      triggers.push({ ...base, type: "time", randomDelayMinutes: durationToMinutes(extractText(inner, "RandomDelay")) });
    } else if (tag === "LogonTrigger") {
      triggers.push({
        ...base,
        type: "logon",
        userId: extractText(inner, "UserId"),
        delayMinutes: durationToMinutes(extractText(inner, "Delay")),
      });
    } else if (tag === "SessionStateChangeTrigger") {
      triggers.push({
        ...base,
        type: "sessionStateChange",
        stateChange: (extractText(inner, "StateChange") as never) ?? "SessionUnlock",
        userId: extractText(inner, "UserId"),
      });
    } else if (tag === "CalendarTrigger") {
      const byDay = extractElement(inner, "ScheduleByDay");
      const byWeek = extractElement(inner, "ScheduleByWeek");
      const byMonth = extractElement(inner, "ScheduleByMonth");
      const byMonthDow = extractElement(inner, "ScheduleByMonthDayOfWeek");
      if (byDay) {
        triggers.push({ ...base, type: "daily", daysInterval: Number(extractText(byDay.inner, "DaysInterval") ?? "1") });
      } else if (byWeek) {
        const daysOfWeek = WEEKDAYS.filter((d) => hasFlag(byWeek.inner, d));
        const dowEl = extractElement(byWeek.inner, "DaysOfWeek");
        triggers.push({
          ...base,
          type: "weekly",
          weeksInterval: Number(extractText(byWeek.inner, "WeeksInterval") ?? "1"),
          daysOfWeek: dowEl ? WEEKDAYS.filter((d) => hasFlag(dowEl.inner, d)) : daysOfWeek,
        });
      } else if (byMonth) {
        const daysOfMonthEl = extractElement(byMonth.inner, "DaysOfMonth");
        const monthsEl = extractElement(byMonth.inner, "Months");
        const days = daysOfMonthEl ? [...daysOfMonthEl.inner.matchAll(/<Day>([^<]+)<\/Day>/g)].map((m2) => m2[1]) : [];
        triggers.push({
          ...base,
          type: "monthly",
          daysOfMonth: days,
          months: monthsEl ? MONTHS.filter((mo) => hasFlag(monthsEl.inner, mo)) : [],
        });
      } else if (byMonthDow) {
        const weeksEl = extractElement(byMonthDow.inner, "Weeks");
        const dowEl = extractElement(byMonthDow.inner, "DaysOfWeek");
        const monthsEl = extractElement(byMonthDow.inner, "Months");
        const weeks = weeksEl ? [...weeksEl.inner.matchAll(/<Week>([^<]+)<\/Week>/g)].map((m2) => m2[1]) : [];
        triggers.push({
          ...base,
          type: "monthlyDow",
          weeks,
          daysOfWeek: dowEl ? WEEKDAYS.filter((d) => hasFlag(dowEl.inner, d)) : [],
          months: monthsEl ? MONTHS.filter((mo) => hasFlag(monthsEl.inner, mo)) : [],
        });
      }
    }
  }

  return triggers;
}

function buildTrigger(t: TaskTrigger): string {
  const base = buildTriggerBase(t);
  switch (t.type) {
    case "boot": {
      const delay = minutesToDuration(t.delayMinutes);
      return `<BootTrigger>${base}${delay ? `<Delay>${delay}</Delay>` : ""}</BootTrigger>`;
    }
    case "registration": {
      const delay = minutesToDuration(t.delayMinutes);
      return `<RegistrationTrigger>${base}${delay ? `<Delay>${delay}</Delay>` : ""}</RegistrationTrigger>`;
    }
    case "idle":
      return `<IdleTrigger>${base}</IdleTrigger>`;
    case "time": {
      const delay = minutesToDuration(t.randomDelayMinutes);
      return `<TimeTrigger>${base}${delay ? `<RandomDelay>${delay}</RandomDelay>` : ""}</TimeTrigger>`;
    }
    case "logon": {
      const delay = minutesToDuration(t.delayMinutes);
      return `<LogonTrigger>${base}${t.userId ? `<UserId>${escapeXml(t.userId)}</UserId>` : ""}${delay ? `<Delay>${delay}</Delay>` : ""}</LogonTrigger>`;
    }
    case "sessionStateChange":
      return (
        `<SessionStateChangeTrigger>${base}` +
        `${t.userId ? `<UserId>${escapeXml(t.userId)}</UserId>` : ""}` +
        `<StateChange>${t.stateChange}</StateChange></SessionStateChangeTrigger>`
      );
    case "daily":
      return `<CalendarTrigger>${base}<ScheduleByDay><DaysInterval>${t.daysInterval}</DaysInterval></ScheduleByDay></CalendarTrigger>`;
    case "weekly":
      return (
        `<CalendarTrigger>${base}<ScheduleByWeek><WeeksInterval>${t.weeksInterval}</WeeksInterval>` +
        `<DaysOfWeek>${t.daysOfWeek.map((d) => `<${d}/>`).join("")}</DaysOfWeek></ScheduleByWeek></CalendarTrigger>`
      );
    case "monthly":
      return (
        `<CalendarTrigger>${base}<ScheduleByMonth>` +
        `<DaysOfMonth>${t.daysOfMonth.map((d) => `<Day>${d}</Day>`).join("")}</DaysOfMonth>` +
        `<Months>${t.months.map((mo) => `<${mo}/>`).join("")}</Months>` +
        `</ScheduleByMonth></CalendarTrigger>`
      );
    case "monthlyDow":
      return (
        `<CalendarTrigger>${base}<ScheduleByMonthDayOfWeek>` +
        `<Weeks>${t.weeks.map((w) => `<Week>${w}</Week>`).join("")}</Weeks>` +
        `<DaysOfWeek>${t.daysOfWeek.map((d) => `<${d}/>`).join("")}</DaysOfWeek>` +
        `<Months>${t.months.map((mo) => `<${mo}/>`).join("")}</Months>` +
        `</ScheduleByMonthDayOfWeek></CalendarTrigger>`
      );
  }
}

// --- Actions ---

function parseActions(tasksInner: string): TaskAction[] {
  const actionsEl = extractElement(tasksInner, "Actions");
  if (!actionsEl) return [];
  const actions: TaskAction[] = [];

  const elementRe = /<(Exec|SendEmail|ShowMessage)\b([^>]*?)(?<!\/)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(actionsEl.inner)) !== null) {
    const [, tag, , inner] = match;
    const uid = crypto.randomUUID();
    if (tag === "Exec") {
      actions.push({
        uid,
        type: "exec",
        command: extractText(inner, "Command") ?? "",
        arguments: extractText(inner, "Arguments"),
        workingDirectory: extractText(inner, "WorkingDirectory"),
      });
    } else if (tag === "SendEmail") {
      actions.push({
        uid,
        type: "sendEmail",
        server: extractText(inner, "Server") ?? "",
        from: extractText(inner, "From"),
        to: extractText(inner, "To"),
        cc: extractText(inner, "Cc"),
        subject: extractText(inner, "Subject"),
        body: extractText(inner, "Body"),
      });
    } else if (tag === "ShowMessage") {
      actions.push({ uid, type: "showMessage", title: extractText(inner, "Title") ?? "", body: extractText(inner, "Body") ?? "" });
    }
  }

  return actions;
}

function buildAction(a: TaskAction): string {
  if (a.type === "exec") {
    return (
      `<Exec><Command>${escapeXml(a.command)}</Command>` +
      `${a.arguments ? `<Arguments>${escapeXml(a.arguments)}</Arguments>` : ""}` +
      `${a.workingDirectory ? `<WorkingDirectory>${escapeXml(a.workingDirectory)}</WorkingDirectory>` : ""}</Exec>`
    );
  }
  if (a.type === "sendEmail") {
    return (
      `<SendEmail><Server>${escapeXml(a.server)}</Server>` +
      `${a.from ? `<From>${escapeXml(a.from)}</From>` : ""}` +
      `${a.to ? `<To>${escapeXml(a.to)}</To>` : ""}` +
      `${a.cc ? `<Cc>${escapeXml(a.cc)}</Cc>` : ""}` +
      `${a.subject ? `<Subject>${escapeXml(a.subject)}</Subject>` : ""}` +
      `${a.body ? `<Body>${escapeXml(a.body)}</Body>` : ""}</SendEmail>`
    );
  }
  return `<ShowMessage><Title>${escapeXml(a.title)}</Title><Body>${escapeXml(a.body)}</Body></ShowMessage>`;
}

// --- Principal ---

const PRINCIPAL_USER_IDS: Record<TaskPrincipal["account"], string | undefined> = {
  SYSTEM: "NT AUTHORITY\\SYSTEM",
  "LOCAL SERVICE": "NT AUTHORITY\\LOCAL SERVICE",
  "NETWORK SERVICE": "NT AUTHORITY\\NETWORK SERVICE",
  CURRENT_USER: "%LogonDomain%\\%LogonUser%",
};

function principalLogonType(account: TaskPrincipal["account"]): string {
  return account === "CURRENT_USER" ? "InteractiveToken" : "S4U";
}

function parsePrincipal(tasksInner: string): TaskPrincipal {
  const principalsEl = extractElement(tasksInner, "Principals");
  const principalEl = principalsEl ? extractElement(principalsEl.inner, "Principal") : undefined;
  const userId = principalEl ? extractText(principalEl.inner, "UserId") : undefined;
  const account = (Object.entries(PRINCIPAL_USER_IDS).find(([, v]) => v === userId)?.[0] as TaskPrincipal["account"]) ?? "CURRENT_USER";
  const runLevel = (principalEl ? extractText(principalEl.inner, "RunLevel") : undefined) as TaskPrincipal["runLevel"] | undefined;
  return { account, runLevel: runLevel ?? "LeastPrivilege" };
}

function buildPrincipal(p: TaskPrincipal): string {
  const userId = PRINCIPAL_USER_IDS[p.account];
  return (
    `<Principals><Principal id="Author">` +
    `${userId ? `<UserId>${escapeXml(userId)}</UserId>` : ""}` +
    `<LogonType>${principalLogonType(p.account)}</LogonType>` +
    `<RunLevel>${p.runLevel}</RunLevel>` +
    `</Principal></Principals>`
  );
}

// --- Settings ---

const SETTINGS_DEFAULTS: TaskSettings = {
  enabled: true,
  hidden: false,
  allowStartOnDemand: true,
  startWhenAvailable: false,
  runOnlyIfNetworkAvailable: false,
  disallowStartIfOnBatteries: true,
  stopIfGoingOnBatteries: true,
  allowHardTerminate: true,
  wakeToRun: false,
  runOnlyIfIdle: false,
  executionTimeLimitMinutes: 4320, // P3D, Task Scheduler's own default
  priority: 7,
  multipleInstancesPolicy: "IgnoreNew",
};

function parseSettings(tasksInner: string): TaskSettings {
  const el = extractElement(tasksInner, "Settings");
  if (!el) return SETTINGS_DEFAULTS;
  const bool = (tag: string, def: boolean) => {
    const v = extractText(el.inner, tag);
    return v === undefined ? def : v === "true";
  };
  return {
    enabled: bool("Enabled", true),
    hidden: bool("Hidden", false),
    allowStartOnDemand: bool("AllowStartOnDemand", true),
    startWhenAvailable: bool("StartWhenAvailable", false),
    runOnlyIfNetworkAvailable: bool("RunOnlyIfNetworkAvailable", false),
    disallowStartIfOnBatteries: bool("DisallowStartIfOnBatteries", true),
    stopIfGoingOnBatteries: bool("StopIfGoingOnBatteries", true),
    allowHardTerminate: bool("AllowHardTerminate", true),
    wakeToRun: bool("WakeToRun", false),
    runOnlyIfIdle: bool("RunOnlyIfIdle", false),
    executionTimeLimitMinutes: durationToMinutes(extractText(el.inner, "ExecutionTimeLimit")) ?? SETTINGS_DEFAULTS.executionTimeLimitMinutes,
    priority: Number(extractText(el.inner, "Priority") ?? "7"),
    multipleInstancesPolicy: (extractText(el.inner, "MultipleInstancesPolicy") as TaskSettings["multipleInstancesPolicy"]) ?? "IgnoreNew",
    deleteExpiredTaskAfterMinutes: durationToMinutes(extractText(el.inner, "DeleteExpiredTaskAfter")),
  };
}

function buildSettings(s: TaskSettings): string {
  const executionLimit = minutesToDuration(s.executionTimeLimitMinutes) ?? "PT72H";
  const deleteAfter = minutesToDuration(s.deleteExpiredTaskAfterMinutes);
  return (
    `<Settings>` +
    `<AllowStartOnDemand>${boolText(s.allowStartOnDemand)}</AllowStartOnDemand>` +
    `<MultipleInstancesPolicy>${s.multipleInstancesPolicy}</MultipleInstancesPolicy>` +
    `<DisallowStartIfOnBatteries>${boolText(s.disallowStartIfOnBatteries)}</DisallowStartIfOnBatteries>` +
    `<StopIfGoingOnBatteries>${boolText(s.stopIfGoingOnBatteries)}</StopIfGoingOnBatteries>` +
    `<AllowHardTerminate>${boolText(s.allowHardTerminate)}</AllowHardTerminate>` +
    `<StartWhenAvailable>${boolText(s.startWhenAvailable)}</StartWhenAvailable>` +
    `<RunOnlyIfNetworkAvailable>${boolText(s.runOnlyIfNetworkAvailable)}</RunOnlyIfNetworkAvailable>` +
    `<Enabled>${boolText(s.enabled)}</Enabled>` +
    `<Hidden>${boolText(s.hidden)}</Hidden>` +
    `${deleteAfter ? `<DeleteExpiredTaskAfter>${deleteAfter}</DeleteExpiredTaskAfter>` : ""}` +
    `<ExecutionTimeLimit>${executionLimit}</ExecutionTimeLimit>` +
    `<Priority>${s.priority}</Priority>` +
    `<RunOnlyIfIdle>${boolText(s.runOnlyIfIdle)}</RunOnlyIfIdle>` +
    `<WakeToRun>${boolText(s.wakeToRun)}</WakeToRun>` +
    `</Settings>`
  );
}

/**
 * Purpose-built reader/writer, same rationale as the sibling gpp-*.service
 * files. Deliberately skips ComHandler actions and any credential fields —
 * see the shared type doc comments for why.
 */
function parseTasksXml(content: string, scope: Scope): ScheduledTaskPreference[] {
  const items: ScheduledTaskPreference[] = [];
  let order = 0;

  const elementRe = /<(TaskV2|ImmediateTaskV2)\b([^>]*?)(?<!\/)>([\s\S]*?)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = elementRe.exec(content)) !== null) {
    const [, tag, attrsText, inner] = match;
    const attrs = extractAttrs(attrsText);
    const propsMatch = /<Properties\b([^>]*?)(?<!\/)>([\s\S]*)<\/Properties>/.exec(inner);
    const propsAttrs = propsMatch ? extractAttrs(propsMatch[1]) : {};
    const taskEl = propsMatch ? extractElement(propsMatch[2], "Task") : undefined;
    const tasksInner = taskEl?.inner ?? "";

    items.push({
      uid: (attrs.uid ?? "").replace(/[{}]/g, ""),
      order: order++,
      action: (propsAttrs.action as ScheduledTaskPreference["action"]) ?? "U",
      scope,
      name: propsAttrs.name ?? attrs.name ?? "",
      description: taskEl ? extractText(extractElement(tasksInner, "RegistrationInfo")?.inner ?? "", "Description") : undefined,
      immediate: tag === "ImmediateTaskV2",
      triggers: parseTriggers(tasksInner),
      actions: parseActions(tasksInner),
      principal: parsePrincipal(tasksInner),
      settings: parseSettings(tasksInner),
    });
  }

  return items;
}

function buildTaskV2(item: ScheduledTaskPreference, now: string): string {
  const tag = item.immediate ? "ImmediateTaskV2" : "TaskV2";
  const clsid = item.immediate ? IMMEDIATE_TASKV2_CLSID : TASKV2_CLSID;
  const userId = PRINCIPAL_USER_IDS[item.principal.account];

  const registrationInfo =
    `<RegistrationInfo><Author>${escapeXml(userId ?? "")}</Author>` +
    `${item.description ? `<Description>${escapeXml(item.description)}</Description>` : ""}</RegistrationInfo>`;

  const triggersXml = item.immediate || item.triggers.length === 0 ? "" : `<Triggers>${item.triggers.map(buildTrigger).join("")}</Triggers>`;
  const actionsXml = `<Actions>${item.actions.map(buildAction).join("")}</Actions>`;

  const task =
    `<Task version="1.2">${registrationInfo}${buildPrincipal(item.principal)}${buildSettings(item.settings)}${triggersXml}${actionsXml}</Task>`;

  return (
    `<${tag} clsid="${clsid}" name="${escapeXml(item.name)}" image="2" changed="${now}" uid="{${item.uid}}">` +
    `<Properties action="${item.action}" name="${escapeXml(item.name)}" runAs="${escapeXml(userId ?? "")}" ` +
    `logonType="${principalLogonType(item.principal.account)}">${task}</Properties>` +
    `</${tag}>`
  );
}

function buildTasksXml(items: ScheduledTaskPreference[]): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const body = items.map((item) => buildTaskV2(item, now)).join("");
  return `<?xml version="1.0" encoding="utf-8"?>\r\n<ScheduledTasks clsid="${SCHEDULED_TASKS_CLSID}">${body}\r\n</ScheduledTasks>\r\n`;
}

export async function listScheduledTaskPreferences(domainDn: string, guid: string, scope: Scope): Promise<ScheduledTaskPreference[]> {
  try {
    const content = await fs.readFile(getTasksXmlPath(domainDn, guid, scope), "utf-8");
    return parseTasksXml(content, scope);
  } catch {
    return [];
  }
}

async function writeScheduledTaskPreferences(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  items: ScheduledTaskPreference[]
): Promise<void> {
  const xmlPath = getTasksXmlPath(domainDn, guid, scope);
  const tasksDir = path.dirname(xmlPath);
  const isNewDir = await fs.stat(tasksDir).then(
    () => false,
    () => true
  );
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(xmlPath, buildTasksXml(items));
  if (isNewDir) {
    await fixNewSysvolDirAcl();
  }
  await bumpGpoVersion(client, domainDn, getSysvolPath(domainDn), guid, scope);
  await ensureTasksCseRegistered(client, `CN={${guid}},CN=Policies,CN=System,${domainDn}`, scope);
}

const DEFAULT_SETTINGS: TaskSettings = SETTINGS_DEFAULTS;
const DEFAULT_PRINCIPAL: TaskPrincipal = { account: "CURRENT_USER", runLevel: "LeastPrivilege" };

export function defaultScheduledTaskDefaults(): { settings: TaskSettings; principal: TaskPrincipal } {
  return { settings: DEFAULT_SETTINGS, principal: DEFAULT_PRINCIPAL };
}

export async function createScheduledTaskPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  data: Omit<ScheduledTaskPreference, "uid" | "order">
): Promise<ScheduledTaskPreference> {
  const items = await listScheduledTaskPreferences(domainDn, guid, scope);
  const newItem: ScheduledTaskPreference = { ...data, uid: crypto.randomUUID(), order: items.length };
  await writeScheduledTaskPreferences(client, domainDn, guid, scope, [...items, newItem]);
  return newItem;
}

export async function updateScheduledTaskPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string,
  data: Omit<ScheduledTaskPreference, "uid" | "order">
): Promise<ScheduledTaskPreference> {
  const items = await listScheduledTaskPreferences(domainDn, guid, scope);
  const idx = items.findIndex((i) => i.uid === uid);
  if (idx === -1) throw new Error("Geplante Aufgabe nicht gefunden.");
  const updated: ScheduledTaskPreference = { ...data, uid, order: items[idx].order };
  items[idx] = updated;
  await writeScheduledTaskPreferences(client, domainDn, guid, scope, items);
  return updated;
}

export async function deleteScheduledTaskPreference(
  client: ldap.Client,
  domainDn: string,
  guid: string,
  scope: Scope,
  uid: string
): Promise<void> {
  const items = await listScheduledTaskPreferences(domainDn, guid, scope);
  await writeScheduledTaskPreferences(client, domainDn, guid, scope, items.filter((i) => i.uid !== uid));
}
