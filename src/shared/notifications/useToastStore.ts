// src/shared/notifications/useToastStore.ts
// transient toast notification store — manages a stack of auto-dismissing messages

import { create } from 'zustand'

type ToastId = `toast-${string}`

// optional inline action — surfaced as a button next to the message.
// clicking the button dismisses the toast & invokes `onClick`; used by flows
// like local-fork "Sign in to sync" that nudge a follow-up without blocking
interface ToastAction
{
  label: string
  onClick: () => void
}

export interface Toast
{
  id: ToastId
  message: string
  type: 'info' | 'success' | 'error'
  action?: ToastAction
}

interface ToastStore
{
  toasts: Toast[]
  addToast: (
    message: string,
    type?: Toast['type'],
    action?: ToastAction
  ) => void
  removeToast: (id: string) => void
}

const TOAST_DURATION_MS = 3_000
const TOAST_ACTION_DURATION_MS = 8_000
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

if (typeof window !== 'undefined')
{
  import.meta.hot?.dispose(() =>
  {
    for (const handle of dismissalTimers.values())
    {
      window.clearTimeout(handle)
    }
    dismissalTimers.clear()
  })
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info', action) =>
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
        toasts: [...visibleToasts, { id, message, type, action }],
      }
    })

    // toasts w/ an inline action linger longer — the user needs time to read
    // & decide whether to act. dismiss-on-click still applies regardless
    const duration = action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS
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
    }, duration)

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

// extension of `toast` carrying an inline action button. ToastContainer
// dismisses the toast before invoking `action.onClick` so any UI the action
// surfaces (eg the sign-in modal) isn't covered by the toast stack
export const toastWithAction = (
  message: string,
  action: ToastAction,
  type: Toast['type'] = 'info'
): void =>
{
  useToastStore.getState().addToast(message, type, action)
}

import.meta.hot?.dispose(() =>
{
  for (const id of [...dismissalTimers.keys()])
  {
    clearDismissalTimer(id)
  }
  dismissalTimers.clear()
})
