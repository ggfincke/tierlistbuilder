// src/features/workspace/boards/model/runtime.ts
// runtime-only active-board state — drag preview snapshots, keyboard mode, store runtime state

import type { ItemId, TierId } from '@/shared/types/ids'
import type { BoardSnapshot, TierItem } from './contract'

// lightweight ordering snapshot used during drag preview
export interface ContainerSnapshotTier
{
  // stable tier ID used to map preview order back onto the full tier metadata
  id: TierId
  // ordered list of item IDs currently shown in this tier
  itemIds: ItemId[]
}

// runtime-only container ordering snapshot used for drag preview
export interface ContainerSnapshot
{
  // item ordering for each tier row
  tiers: ContainerSnapshotTier[]
  // ordering for items outside all tiers
  unrankedItemIds: ItemId[]
}

// runtime keyboard interaction states for item navigation & drag
export type KeyboardMode = 'idle' | 'browse' | 'dragging'

// full active-board runtime state — board snapshot plus transient drag, selection, & undo state
export interface ActiveBoardRuntimeState extends BoardSnapshot
{
  activeItemId: string | null
  dragPreview: ContainerSnapshot | null
  keyboardMode: KeyboardMode
  keyboardFocusItemId: string | null
  // true after a manual drag-drop commit; reset on shuffle, board load, & undo/redo
  itemsManuallyMoved: boolean
  // ordered list of selected item IDs (insertion order for multi-drag)
  selectedItemIds: string[]
  // last clicked item ID for shift-click range selection
  lastClickedItemId: string | null
  // item IDs being dragged together (ordered — primary item first)
  dragGroupIds: string[]
  runtimeError: string | null
  past: BoardSnapshot[]
  future: BoardSnapshot[]
}

export const freshRuntimeState: Omit<
  ActiveBoardRuntimeState,
  keyof BoardSnapshot
> = {
  activeItemId: null,
  dragPreview: null,
  keyboardMode: 'idle',
  keyboardFocusItemId: null,
  itemsManuallyMoved: false,
  selectedItemIds: [],
  lastClickedItemId: null,
  dragGroupIds: [],
  runtimeError: null,
  past: [],
  future: [],
}

export type ItemRecord = Record<string, TierItem>
