import { useState } from "react";
import type { GpoObject } from "@samba-admin/shared";
import { GpoScopeTab } from "./GpoScopeTab";
import { GpoDetailsTab } from "./GpoDetailsTab";
import { GpoSettingsTab } from "./GpoSettingsTab";
import { GpoDelegationTab } from "./GpoDelegationTab";

type PropertiesTab = "scope" | "details" | "settings" | "delegation";

const TABS: { id: PropertiesTab; label: string }[] = [
  { id: "scope", label: "Bereich" },
  { id: "details", label: "Details" },
  { id: "settings", label: "Einstellungen" },
  { id: "delegation", label: "Delegierung" },
];

/** Mirrors real GPMC's GPO properties page — tabs for Bereich/Details/Einstellungen/Delegierung, shown when a GPO is single-clicked in the tree. */
export function GpoPropertiesView({ gpo, onEdit }: { gpo: GpoObject; onEdit: () => void }) {
  const [activeTab, setActiveTab] = useState<PropertiesTab>("scope");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <svg viewBox="0 0 16 16" className="h-8 w-8 text-indigo-500" aria-hidden="true">
          <rect x="2" y="1" width="12" height="14" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="2" y="1" width="12" height="14" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
          <rect x="5" y="4" width="6" height="1" fill="currentColor" />
          <rect x="5" y="6.5" width="6" height="1" fill="currentColor" />
          <rect x="5" y="9" width="4" height="1" fill="currentColor" />
        </svg>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{gpo.displayName}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">GUID: {`{${gpo.guid}}`}</p>
        </div>
        <button onClick={onEdit} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
          Bearbeiten
        </button>
      </div>

      <div className="flex gap-0.5 border-b border-slate-300 bg-[#ece9d8] px-2 pt-1.5 dark:border-slate-700 dark:bg-slate-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t-sm border px-4 py-1.5 text-sm ${
              activeTab === tab.id
                ? "border-slate-400 border-b-white bg-white font-medium text-slate-900 dark:border-slate-600 dark:border-b-slate-900 dark:bg-slate-900 dark:text-slate-100"
                : "border-transparent text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
            style={activeTab === tab.id ? { marginBottom: -1 } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-white p-4 dark:bg-slate-900">
        {activeTab === "scope" && <GpoScopeTab gpo={gpo} />}
        {activeTab === "details" && <GpoDetailsTab gpo={gpo} />}
        {activeTab === "settings" && <GpoSettingsTab gpo={gpo} />}
        {activeTab === "delegation" && <GpoDelegationTab gpo={gpo} />}
      </div>
    </div>
  );
}
