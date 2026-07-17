import { useTranslation } from "react-i18next";

/** Cycles Deutsch <-> English. */
export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  function toggle() {
    i18n.changeLanguage(i18n.language === "de" ? "en" : "de");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={t("language.label")}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <span aria-hidden="true">🌐</span>
      <span>{i18n.language === "de" ? "DE" : "EN"}</span>
    </button>
  );
}
