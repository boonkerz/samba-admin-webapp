import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "theme-mode";

function isValidMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return mode === "dark";
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", resolveIsDark(mode));
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const initialMode: ThemeMode = (() => {
  const stored = localStorage.getItem(THEME_KEY);
  return isValidMode(stored) ? stored : "system";
})();

applyTheme(initialMode);

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode,
  setMode: (mode) => {
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(mode);
    set({ mode });
  },
}));

// Keep "system" mode in sync with live OS theme changes.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (useThemeStore.getState().mode === "system") applyTheme("system");
});
