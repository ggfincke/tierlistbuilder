// src/features/platform/sync/progress/useCloudPullProgressStore.ts
// progress store for the first-login cloud pull — WorkspaceShell reads it
// directly & renders the blocking ProgressOverlay

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
      set((state) => ({
        current: Math.min(state.current + 1, state.total),
      })),
    end: () => set({ current: 0, total: 0 }),
  })
)
