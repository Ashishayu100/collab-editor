import { create } from 'zustand';

interface LoadingStore {
  /** Count of in-flight requests — 0 means idle. A count (not a boolean) so overlapping
   *  requests don't have one's completion prematurely hide the bar for the others still in flight. */
  activeRequests: number;
  increment: () => void;
  decrement: () => void;
}

export const useLoadingStore = create<LoadingStore>((set) => ({
  activeRequests: 0,
  increment: () => set((state) => ({ activeRequests: state.activeRequests + 1 })),
  decrement: () => set((state) => ({ activeRequests: Math.max(0, state.activeRequests - 1) })),
}));
