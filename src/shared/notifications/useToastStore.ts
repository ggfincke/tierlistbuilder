// src/shared/notifications/useToastStore.ts
// transient toast notification store — manages a stack of auto-dismissing messages

import { create } from 'zustand'

export interface Toast
{
  id: string
  message: string
  type: 'info' | 'success' | 'error'
}

interface ToastStore
{
  toasts: Toast[]
  addToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

const TOAST_DURATION_MS = 3_000
const MAX_VISIBLE_TOASTS = 5

// per-toast auto-dismiss timer registry — clears when a toast is removed
// manually or expires naturally so we never fire setState on stale ids
const dismissalTimers = new Map<string, number>()

const clearDismissalTimer = (id: string): void =>
{
  const handle = dismissalTimers.get(id)
  if (handle !== undefined)
  {
    window.clearTimeout(handle)
    dismissalTimers.delete(id)
  }
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') =>
  {
    const id = `toast-${crypto.randomUUID()}`
    set((state) =>
    {
      // drop the oldest dismissal timer if we're trimming the queue
      const overflow = state.toasts.slice(
        0,
        Math.max(0, state.toasts.length - (MAX_VISIBLE_TOASTS - 1))
      )
      for (const stale of overflow)
      {
        clearDismissalTimer(stale.id)
      }

      return {
        toasts: [
          ...state.toasts.slice(-(MAX_VISIBLE_TOASTS - 1)),
          { id, message, type },
        ],
      }
    })

    const handle = window.setTimeout(() =>
    {
      dismissalTimers.delete(id)
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, TOAST_DURATION_MS)

    dismissalTimers.set(id, handle)
  },
  removeToast: (id) =>
  {
    clearDismissalTimer(id)
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

export const toast = (message: string, type?: Toast['type']): void =>
  useToastStore.getState().addToast(message, type)
