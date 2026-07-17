import { useTranslation } from "react-i18next";
import { useThemeStore, type ThemeMode } from "../state/themeStore";

const MODE_ORDER: ThemeMode[] = ["light", "dark", "system"];
const MODE_ICON: Record<ThemeMode, string> = { light: "☀", dark: "☾", system: "⚙" };

/** Cycles Hell -> Dunkel -> System -> Hell, matching the current mode's icon/label. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  function cycle() {
    const next = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
    setMode(next);
  }

  const label = t(`theme.${mode}`);

  return (
    <button
      type="button"
      onClick={cycle}
      title={t("theme.toggleTitle", { mode: label })}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <span aria-hidden="true">{MODE_ICON[mode]}</span>
      <span>{label}</span>
    </button>
  );
}
