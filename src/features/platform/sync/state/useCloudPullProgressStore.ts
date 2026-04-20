// src/features/platform/sync/state/useCloudPullProgressStore.ts
// progress store for first-login cloud pull; WorkspaceShell renders the blocking overlay

import { create } from 'zustand'

interface CloudPullProgressStore
{
  current: number
  total: number
  start: (total: number) => void
  bump: () => void
  end: () => void
}

export const useCloudPullProgressStore = create<CloudPullProgressStore>(
  (set) => ({
    current: 0,
    total: 0,
    start: (total) => set({ current: 0, total: Math.max(0, total) }),
    bump: () =>
      set((state) =>
      {
        const next = Math.min(state.current + 1, state.total)
        if (next === state.current) return state
        return { current: next }
      }),
    end: () => set({ current: 0, total: 0 }),
  })
)
