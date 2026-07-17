import { create } from "zustand";

const SHOW_ADVANCED_KEY = "ad-explorer-show-advanced";

interface DirectoryState {
  selectedDn?: string;
  expanded: Set<string>;
  showAdvanced: boolean;
  select: (dn: string) => void;
  toggleExpanded: (dn: string) => void;
  toggleShowAdvanced: () => void;
}

export const useDirectoryStore = create<DirectoryState>((set) => ({
  selectedDn: undefined,
  expanded: new Set(),
  showAdvanced: localStorage.getItem(SHOW_ADVANCED_KEY) === "1",
  select: (dn) => set({ selectedDn: dn }),
  toggleExpanded: (dn) =>
    set((state) => {
      const next = new Set(state.expanded);
      if (next.has(dn)) next.delete(dn);
      else next.add(dn);
      return { expanded: next };
    }),
  toggleShowAdvanced: () =>
    set((state) => {
      const next = !state.showAdvanced;
      localStorage.setItem(SHOW_ADVANCED_KEY, next ? "1" : "0");
      return { showAdvanced: next };
    }),
}));
