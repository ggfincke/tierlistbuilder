// src/features/workspace/boards/model/runtime.ts
// runtime-only active-board state — drag preview snapshots, keyboard mode, store runtime state

import type { ItemId, TierId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  BoardSnapshot,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'

// lightweight ordering snapshot used during drag preview
export interface ContainerSnapshotTier
{
  id: TierId
  itemIds: ItemId[]
}

// runtime-only container ordering snapshot used for drag preview
export interface ContainerSnapshot
{
  tiers: ContainerSnapshotTier[]
  unrankedItemIds: ItemId[]
}

// runtime keyboard interaction states for item navigation & drag
export type KeyboardMode = 'idle' | 'browse' | 'dragging'

// one entry on the undo/redo stack — a board snapshot paired w/ the human-readable
// label describing the action that produced it (rendered in undo/redo toasts)
export interface UndoEntry
{
  snapshot: BoardSnapshot
  label: string
}

// selection bundle — insertion-ordered IDs paired w/ an O(1) lookup set.
// constructed only via makeSelection so ids & set cannot desync
export interface Selection
{
  readonly ids: readonly ItemId[]
  readonly set: ReadonlySet<ItemId>
}

const EMPTY_SET: ReadonlySet<ItemId> = new Set<ItemId>()

export const EMPTY_SELECTION: Selection = Object.freeze({
  ids: [] as readonly ItemId[],
  set: EMPTY_SET,
})

export const makeSelection = (ids: readonly ItemId[]): Selection =>
{
  if (ids.length === 0) return EMPTY_SELECTION
  // copy ids so later mutation of the input array can't desync ids & set
  const copied = ids.slice()
  return { ids: copied, set: new Set(copied) }
}

// full active-board runtime state — board snapshot plus transient drag, selection, & undo state
export interface ActiveBoardRuntimeState extends BoardSnapshot
{
  activeItemId: ItemId | null
  dragPreview: ContainerSnapshot | null
  keyboardMode: KeyboardMode
  keyboardFocusItemId: ItemId | null
  itemsManuallyMoved: boolean
  selection: Selection
  lastClickedItemId: ItemId | null
  dragGroupIds: ItemId[]
  runtimeError: string | null
  past: UndoEntry[]
  future: UndoEntry[]
}

type RuntimeOnlyState = Omit<ActiveBoardRuntimeState, keyof BoardSnapshot>

// factory — callers spread into set() patches. returning a fresh object
// each call avoids aliasing the empty arrays/maps across store instances
export const createFreshRuntimeState = (): RuntimeOnlyState => ({
  activeItemId: null,
  dragPreview: null,
  keyboardMode: 'idle',
  keyboardFocusItemId: null,
  itemsManuallyMoved: false,
  selection: EMPTY_SELECTION,
  lastClickedItemId: null,
  dragGroupIds: [],
  runtimeError: null,
  past: [],
  future: [],
})

// subset reset used by undo/redo — keeps in-flight UI state aligned w/ the
// restored snapshot without clobbering past/future/itemsManuallyMoved
export type UndoRestoreRuntimePatch = Pick<
  RuntimeOnlyState,
  | 'activeItemId'
  | 'dragPreview'
  | 'dragGroupIds'
  | 'keyboardMode'
  | 'keyboardFocusItemId'
  | 'selection'
  | 'lastClickedItemId'
>

export const createUndoRestoreRuntimePatch = (): UndoRestoreRuntimePatch => ({
  activeItemId: null,
  dragPreview: null,
  dragGroupIds: [],
  keyboardMode: 'idle',
  keyboardFocusItemId: null,
  selection: EMPTY_SELECTION,
  lastClickedItemId: null,
})

export type ItemRecord = Record<ItemId, TierItem>
