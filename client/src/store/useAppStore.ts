import { create } from 'zustand';

/**
 * Client state only.
 *
 * Anything fetched from the server — recommendations, combos — lives in
 * TanStack Query instead (see api/queries.ts), which owns caching and
 * loading/error state for it. This store is for things the user is
 * manipulating directly, which is where an account's session and preferences
 * would go later.
 */
interface AppState {
  /** Live textarea contents. */
  rawList: string;
  /** The list actually submitted — the key everything server-side hangs off. */
  submittedList: string;
  setRawList: (text: string) => void;
  submitList: (text: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  rawList: '',
  submittedList: '',
  setRawList: (rawList) => set({ rawList }),
  submitList: (submittedList) => set({ submittedList }),
}));
