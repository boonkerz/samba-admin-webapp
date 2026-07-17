import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

const LANGUAGE_KEY = "language";

function initialLanguage(): string {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === "de" || stored === "en") return stored;
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => localStorage.setItem(LANGUAGE_KEY, lng));

export default i18n;
