import { create } from 'zustand';
import type { RecommendResponse } from '../types';

interface AppState {
  rawList: string;
  isLoading: boolean;
  error: string | null;
  result: RecommendResponse | null;
  setRawList: (text: string) => void;
  setResult: (result: RecommendResponse) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  rawList: '',
  isLoading: false,
  error: null,
  result: null,
  setRawList: (rawList) => set({ rawList }),
  setResult: (result) => set({ result, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
}));
