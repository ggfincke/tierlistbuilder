// src/features/workspace/boards/model/slices/types.ts
// shared slice shape types for the composed active board store

import type { StateCreator } from 'zustand'

import type {
  BoardSnapshot,
  NewTierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  ActiveBoardRuntimeState,
  ContainerSnapshot,
  KeyboardMode,
} from '~/features/workspace/boards/model/runtime'
import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import type { ItemId, TierId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  PaletteId,
  TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'

// board data slice — serializable board snapshot + CRUD & shuffle actions
export interface BoardDataSlice extends BoardSnapshot
{
  itemsManuallyMoved: boolean
  addTier: (paletteId: PaletteId) => void
  renameTier: (tierId: TierId, name: string) => void
  setTierDescription: (tierId: TierId, description: string) => void
  recolorTier: (tierId: TierId, colorSpec: TierColorSpec) => void
  recolorTierRow: (tierId: TierId, rowColorSpec: TierColorSpec | null) => void
  reorderTier: (tierId: TierId, direction: 'up' | 'down') => void
  reorderTierByIndex: (fromIndex: number, toIndex: number) => void
  deleteTier: (tierId: TierId) => void
  clearTierItems: (tierId: TierId) => void
  addTierAt: (index: number, paletteId: PaletteId) => void
  addItems: (newItems: NewTierItem[]) => void
  addTextItem: (label: string, backgroundColor: string) => void
  setItemAltText: (itemId: ItemId, altText: string) => void
  removeItem: (itemId: ItemId) => void
  restoreDeletedItem: (itemId: ItemId) => void
  permanentlyDeleteItem: (itemId: ItemId) => void
  clearDeletedItems: () => void
  clearAllItems: () => void
  sortTierItemsByName: (tierId: TierId) => void
  shuffleAllItems: (mode: 'even' | 'random') => void
  shuffleUnrankedItems: () => void
  resetBoard: (paletteId: PaletteId) => void
  loadBoard: (data: BoardSnapshot, syncState?: BoardSyncState) => void
}

// selection slice — multi-item selection state & bulk actions
export interface SelectionSlice
{
  selectedItemIds: ItemId[]
  selectedItemIdSet: ReadonlySet<ItemId>
  lastClickedItemId: ItemId | null
  toggleItemSelected: (
    itemId: ItemId,
    shiftKey: boolean,
    modKey: boolean
  ) => void
  clearSelection: () => void
  selectAll: () => void
  moveSelectedToTier: (tierId: TierId) => void
  moveSelectedToUnranked: () => void
  deleteSelectedItems: () => void
}

// drag preview slice — transient snapshot ordering during drag
export interface DragPreviewSlice
{
  activeItemId: ItemId | null
  dragPreview: ContainerSnapshot | null
  dragGroupIds: ItemId[]
  setActiveItemId: (itemId: ItemId | null) => void
  beginDragPreview: (activeId?: ItemId) => void
  updateDragPreview: (preview: ContainerSnapshot) => void
  commitDragPreview: () => void
  discardDragPreview: () => void
}

// keyboard slice — keyboard browse/drag mode state & navigation actions
export interface KeyboardSlice
{
  keyboardMode: KeyboardMode
  keyboardFocusItemId: ItemId | null
  setKeyboardMode: (mode: KeyboardMode) => void
  setKeyboardFocusItemId: (itemId: ItemId | null) => void
  clearKeyboardMode: () => void
  cancelKeyboardDrag: () => void
}

// undo slice — past/future snapshot stacks & navigation. pastLabels/futureLabels
// are parallel arrays describing the action that produced each snapshot, used
// for undo/redo toasts; must remain length-synced w/ past/future
export interface UndoSlice
{
  past: BoardSnapshot[]
  pastLabels: string[]
  future: BoardSnapshot[]
  futureLabels: string[]
  undo: () => { label: string } | null
  redo: () => { label: string } | null
}

// runtime error slice — user-visible banner message for fatal operations
export interface RuntimeErrorSlice
{
  runtimeError: string | null
  setRuntimeError: (message: string) => void
  clearRuntimeError: () => void
}

// sync slice — cloud sync revision cursor & board identity
export interface SyncSlice extends BoardSyncState
{
  setSyncState: (state: {
    lastSyncedRevision?: number | null
    cloudBoardExternalId?: string | null
  }) => void
}

// the full combined store shape — every slice merged into one flat object
export type ActiveBoardStore = BoardDataSlice &
  SelectionSlice &
  DragPreviewSlice &
  KeyboardSlice &
  UndoSlice &
  RuntimeErrorSlice &
  SyncSlice

// convenience alias — every slice creator takes the combined store shape so
// cross-slice reads via `get()` work w/o extra plumbing
export type ActiveBoardSliceCreator<TSlice> = StateCreator<
  ActiveBoardStore,
  [],
  [],
  TSlice
>

// compile-time sanity check — ActiveBoardStore must remain compatible w/
// ActiveBoardRuntimeState so existing helpers/selectors keep working
const _runtimeShapeCheck = (store: ActiveBoardStore): ActiveBoardRuntimeState =>
  store
void _runtimeShapeCheck
