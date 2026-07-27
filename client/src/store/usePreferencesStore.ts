import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Durable UI preferences — how many results to show per page, wherever
 * pagination shows up. Kept separate from useAppStore, which is deliberately
 * *not* persisted: rawList/submittedList/dismissed belong to one browsing
 * session, and carrying dismissals over to a browser restart (against
 * whatever list happens to be pasted in next) would be surprising. A page
 * size preference has the opposite property — it should outlive the tab.
 */
interface PreferencesState {
  suggestionsPerPage: number;
  combosPerPage: number;
  setSuggestionsPerPage: (n: number) => void;
  setCombosPerPage: (n: number) => void;
}

export const SUGGESTIONS_PAGE_SIZE_OPTIONS = [9, 18, 36, 72] as const;
export const COMBOS_PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      suggestionsPerPage: SUGGESTIONS_PAGE_SIZE_OPTIONS[0],
      combosPerPage: COMBOS_PAGE_SIZE_OPTIONS[1],
      setSuggestionsPerPage: (n) => set({ suggestionsPerPage: n }),
      setCombosPerPage: (n) => set({ combosPerPage: n }),
    }),
    { name: 'mtg-recommender-preferences' }
  )
);
