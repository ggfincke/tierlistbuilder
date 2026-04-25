// src/features/workspace/imageEditor/model/useImageEditorStore.ts
// transient open/filter/selection state for the per-item image editor; kept
// out of the active board store so opening doesn't trip undo or sync diffing

import { create } from 'zustand'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

export type ImageEditorFilter = 'all' | 'mismatched' | 'adjusted'

interface ImageEditorState
{
  isOpen: boolean
  filter: ImageEditorFilter
  // item to focus on open; cleared after the modal mounts so reopening
  // w/o an explicit id falls back to the filter's first match
  initialItemId: ItemId | null
  open: (opts?: { filter?: ImageEditorFilter; itemId?: ItemId | null }) => void
  close: () => void
  setFilter: (filter: ImageEditorFilter) => void
}

export const useImageEditorStore = create<ImageEditorState>((set) => ({
  isOpen: false,
  filter: 'all',
  initialItemId: null,
  open: (opts) =>
    set({
      isOpen: true,
      filter: opts?.filter ?? 'all',
      initialItemId: opts?.itemId ?? null,
    }),
  close: () => set({ isOpen: false, initialItemId: null }),
  setFilter: (filter) => set({ filter }),
}))
