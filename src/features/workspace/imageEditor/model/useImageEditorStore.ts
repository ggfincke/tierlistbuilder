// src/features/workspace/imageEditor/model/useImageEditorStore.ts
// transient open/filter/selection state for the per-item image editor; kept
// out of the active board store so opening does not create undo entries

import { create } from 'zustand'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

export type ImageEditorFilter = 'all' | 'mismatched' | 'adjusted'

// 'single' mode is the canonical per-item edit surface — hides the rail,
// widens the pane, & exposes label / alt / notes / background fields.
// 'multi' mode is the original "Adjust items to fit board" auditing flow
export type ImageEditorMode = 'single' | 'multi'

interface ImageEditorState
{
  isOpen: boolean
  mode: ImageEditorMode
  filter: ImageEditorFilter
  // item to focus on open; cleared after the modal mounts so reopening
  // w/o an explicit id falls back to the filter's first match
  initialItemId: ItemId | null
  open: (opts?: {
    mode?: ImageEditorMode
    filter?: ImageEditorFilter
    itemId?: ItemId | null
  }) => void
  close: () => void
  setFilter: (filter: ImageEditorFilter) => void
}

export const useImageEditorStore = create<ImageEditorState>((set) => ({
  isOpen: false,
  mode: 'multi',
  filter: 'all',
  initialItemId: null,
  open: (opts) =>
    set({
      isOpen: true,
      mode: opts?.mode ?? 'multi',
      filter: opts?.filter ?? 'all',
      initialItemId: opts?.itemId ?? null,
    }),
  close: () =>
    set((state) =>
      state.isOpen || state.initialItemId !== null
        ? { isOpen: false, initialItemId: null }
        : state
    ),
  setFilter: (filter) =>
    set((state) => (state.filter === filter ? state : { filter })),
}))
