// src/features/workspace/boards/model/slices/types.ts
// shared slice shape types for the composed active board store

import type { StateCreator } from 'zustand'

import type {
  BoardSnapshot,
  ImageFit,
  ItemAspectRatioMode,
  NewTierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  ActiveBoardRuntimeState,
  ContainerSnapshot,
  KeyboardMode,
  Selection,
  UndoEntry,
} from '~/features/workspace/boards/model/runtime'
import type { BoardSyncState } from '~/features/workspace/boards/model/sync'
import type { ItemId, TierId } from '@tierlistbuilder/contracts/lib/ids'
import type {
  PaletteId,
  TierColorSpec,
} from '@tierlistbuilder/contracts/lib/theme'

// board data slice — serializable board snapshot + CRUD & shuffle actions +
// sync-state cursor & runtime error banner (the latter two are small enough
// that separate slices didn't pay rent)
export interface BoardDataSlice extends BoardSnapshot, BoardSyncState
{
  itemsManuallyMoved: boolean
  runtimeError: string | null
  setSyncState: (state: {
    lastSyncedRevision?: number | null
    cloudBoardExternalId?: string | null
    pendingSyncAt?: number | null
  }) => void
  setRuntimeError: (message: string) => void
  clearRuntimeError: () => void
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
  // switches mode to 'manual'
  setBoardItemAspectRatio: (value: number) => void
  // 'auto' recomputes from current items; 'manual' preserves the value
  setBoardAspectRatioMode: (mode: ItemAspectRatioMode) => void
  setItemImageFit: (itemId: ItemId, fit: ImageFit | null) => void
  setItemsImageFit: (itemIds: ItemId[], fit: ImageFit | null) => void
  backfillItemAspectRatios: (values: Record<ItemId, number>) => void
  setAspectRatioPromptDismissed: (dismissed: boolean) => void
  setDefaultItemImageFit: (fit: ImageFit | null) => void
}

// selection slice — multi-item selection state & bulk actions
export interface SelectionSlice
{
  selection: Selection
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

// undo slice — past/future UndoEntry stacks & navigation. each entry bundles
// a board snapshot w/ the label describing the action that produced it
export interface UndoSlice
{
  past: UndoEntry[]
  future: UndoEntry[]
  undo: () => { label: string } | null
  redo: () => { label: string } | null
}

// the full combined store shape — every slice merged into one flat object
export type ActiveBoardStore = BoardDataSlice &
  SelectionSlice &
  DragPreviewSlice &
  KeyboardSlice &
  UndoSlice

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
