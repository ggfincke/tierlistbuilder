// src/shared/notifications/useToastStore.ts
// transient toast notification store — manages a stack of auto-dismissing messages

import { create } from 'zustand'

type ToastId = `toast-${string}`

export interface Toast
{
  id: ToastId
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

const generateToastId = (): ToastId => `toast-${crypto.randomUUID()}`

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
    const id = generateToastId()
    set((state) =>
    {
      const shouldTrim = state.toasts.length >= MAX_VISIBLE_TOASTS
      // drop the oldest dismissal timer if we're trimming the queue
      if (shouldTrim)
      {
        const overflow = state.toasts.slice(
          0,
          state.toasts.length - (MAX_VISIBLE_TOASTS - 1)
        )
        for (const stale of overflow)
        {
          clearDismissalTimer(stale.id)
        }
      }

      const visibleToasts = shouldTrim
        ? state.toasts.slice(-(MAX_VISIBLE_TOASTS - 1))
        : state.toasts

      return {
        toasts: [...visibleToasts, { id, message, type }],
      }
    })

    const handle = window.setTimeout(() =>
    {
      dismissalTimers.delete(id)
      set((state) =>
      {
        const nextToasts = state.toasts.filter((t) => t.id !== id)
        return nextToasts.length === state.toasts.length
          ? state
          : { toasts: nextToasts }
      })
    }, TOAST_DURATION_MS)

    dismissalTimers.set(id, handle)
  },
  removeToast: (id) =>
  {
    clearDismissalTimer(id)
    set((state) =>
    {
      const nextToasts = state.toasts.filter((t) => t.id !== id)
      return nextToasts.length === state.toasts.length
        ? state
        : { toasts: nextToasts }
    })
  },
}))

export const toast = (message: string, type?: Toast['type']): void =>
  useToastStore.getState().addToast(message, type)
