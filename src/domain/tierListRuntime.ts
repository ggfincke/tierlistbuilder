// src/domain/tierListRuntime.ts
// shared active-board runtime types used by store & domain helpers

import type {
  ContainerSnapshot,
  KeyboardMode,
  TierItem,
  TierListData,
} from '../types'

export interface TierListStoreRuntimeState extends TierListData
{
  activeItemId: string | null
  dragPreview: ContainerSnapshot | null
  keyboardMode: KeyboardMode
  keyboardFocusItemId: string | null
  // true after a manual drag-drop commit; reset on shuffle, board load, & undo/redo
  itemsManuallyMoved: boolean
  // set of item IDs currently selected for bulk operations
  selectedItemIds: Set<string>
  // last clicked item ID for shift-click range selection
  lastClickedItemId: string | null
  runtimeError: string | null
  past: TierListData[]
  future: TierListData[]
}

export const freshRuntimeState: Omit<
  TierListStoreRuntimeState,
  keyof TierListData
> = {
  activeItemId: null,
  dragPreview: null,
  keyboardMode: 'idle',
  keyboardFocusItemId: null,
  itemsManuallyMoved: false,
  selectedItemIds: new Set<string>(),
  lastClickedItemId: null,
  runtimeError: null,
  past: [],
  future: [],
}

export type ItemRecord = Record<string, TierItem>
