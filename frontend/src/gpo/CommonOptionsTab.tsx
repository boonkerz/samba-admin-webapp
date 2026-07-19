import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CommonItemOptions } from "@samba-admin/shared";
import { WinLabel, WinTextarea, WinCheckbox } from "../components/WindowsDialog";
import { TargetingEditorDialog } from "./TargetingEditorDialog";

/** Mirrors every GPP item's "Common Options" tab ("Gemeinsame Optionen" in German Windows) — Windows Server's item-level targeting entry point. */
export function CommonOptionsTab({
  value,
  onChange,
  showRunInUserContext,
}: {
  value: CommonItemOptions;
  onChange: (value: CommonItemOptions) => void;
  /** "Run in logged-on user's security context" only applies to Computer Configuration preference items that support it — hidden for User Configuration items, which always run as the user anyway. */
  showRunInUserContext: boolean;
}) {
  const { t } = useTranslation();
  const [showTargeting, setShowTargeting] = useState(false);
  const targetingEnabled = value.targeting.length > 0;

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2 rounded-sm border border-slate-300 p-3 dark:border-slate-600">
        <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-400">
          {t("commonOptions.legend", "Common Options for all Items")}
        </legend>

        <WinCheckbox
          label={t("commonOptions.stopOnError", "Stop processing items in this extension on error")}
          checked={value.stopOnError}
          onChange={(e) => onChange({ ...value, stopOnError: e.target.checked })}
        />
        {showRunInUserContext && (
          <WinCheckbox
            label={t("commonOptions.runInUserContext", "Run in logged-on user's security context (user policy option)")}
            checked={value.runInUserContext}
            onChange={(e) => onChange({ ...value, runInUserContext: e.target.checked })}
          />
        )}
        <WinCheckbox
          label={t("commonOptions.removeWhenNotApplied", "Remove this item when it is no longer applied")}
          checked={value.removeWhenNotApplied}
          onChange={(e) => onChange({ ...value, removeWhenNotApplied: e.target.checked })}
        />
        <WinCheckbox
          label={t("commonOptions.applyOnce", "Apply once and do not reapply")}
          checked={value.applyOnce}
          onChange={(e) => onChange({ ...value, applyOnce: e.target.checked })}
        />

        <div className="flex items-center gap-2">
          <WinCheckbox
            label={t("commonOptions.itemLevelTargeting", "Item-level targeting")}
            checked={targetingEnabled}
            onChange={(e) => {
              if (e.target.checked) setShowTargeting(true);
              else onChange({ ...value, targeting: [] });
            }}
          />
          <button
            className="rounded-sm border border-slate-400 bg-[#f0f0f0] px-3 py-1 text-xs text-slate-800 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            disabled={!targetingEnabled}
            onClick={() => setShowTargeting(true)}
          >
            {t("commonOptions.targetingButton", "Targeting...")}
          </button>
        </div>
      </fieldset>

      <div>
        <WinLabel>{t("commonOptions.description", "Description:")}</WinLabel>
        <WinTextarea
          rows={4}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </div>

      {showTargeting && (
        <TargetingEditorDialog
          value={value.targeting}
          onClose={() => setShowTargeting(false)}
          onSave={(targeting) => {
            onChange({ ...value, targeting });
            setShowTargeting(false);
          }}
        />
      )}
    </div>
  );
}

export function defaultCommonItemOptions(): CommonItemOptions {
  return { stopOnError: false, runInUserContext: false, removeWhenNotApplied: false, applyOnce: false, description: "", targeting: [] };
}
