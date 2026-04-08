// src/store/useToastStore.ts
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

let nextId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') =>
  {
    const id = `toast-${++nextId}`
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { id, message, type }],
    }))
    setTimeout(() =>
    {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, 3000)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

// convenience helper for calling outside React components
export const toast = (message: string, type?: Toast['type']): void =>
  useToastStore.getState().addToast(message, type)
