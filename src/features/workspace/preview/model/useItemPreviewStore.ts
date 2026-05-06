// src/features/workspace/preview/model/useItemPreviewStore.ts
// transient open state for the item preview lightbox; kept out of the active
// board store so opening does not create undo entries

import { create } from 'zustand'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

interface ItemPreviewState
{
  isOpen: boolean
  itemId: ItemId | null
  open: (itemId: ItemId) => void
  close: () => void
}

export const useItemPreviewStore = create<ItemPreviewState>((set) => ({
  isOpen: false,
  itemId: null,
  open: (itemId) => set({ isOpen: true, itemId }),
  close: () => set({ isOpen: false, itemId: null }),
}))
