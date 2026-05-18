// src/features/workspace/boards/model/slices/selectors.ts
// cross-slice selectors derived from the combined active-board store

import {
  isEmptyBoardLabelSettings,
  isEmptyItemLabelOptions,
  type BoardLabelSettings,
  type Tier,
  type TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ActiveBoardRuntimeState } from '~/features/workspace/boards/model/runtime'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

// true while a pointer drag preview is active or a keyboard-drag group exists
export const selectIsDragging = (
  state: Pick<ActiveBoardRuntimeState, 'dragPreview' | 'dragGroupIds'>
): boolean => state.dragPreview !== null || state.dragGroupIds.length > 0

// whether the undo stack has anything to revert
export const selectCanUndo = (
  state: Pick<ActiveBoardRuntimeState, 'past'>
): boolean => state.past.length > 0

// whether the redo stack has anything to replay
export const selectCanRedo = (
  state: Pick<ActiveBoardRuntimeState, 'future'>
): boolean => state.future.length > 0

// count active items without subscribing consumers to the item map object
export const selectActiveItemCount = (
  state: Pick<ActiveBoardRuntimeState, 'activeItemCount'>
): number => state.activeItemCount

export const createSelectBoardItemById =
  (itemId: ItemId) =>
  (state: Pick<ActiveBoardRuntimeState, 'items'>): TierItem | undefined =>
    state.items[itemId]

export const filterItemIdsByLabel = (
  items: Pick<ActiveBoardRuntimeState, 'items'>['items'],
  itemIds: readonly ItemId[],
  query: string
): ItemId[] =>
{
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return [...itemIds]
  return itemIds.filter((id) =>
    items[id]?.label?.toLowerCase().includes(normalizedQuery)
  )
}

// true when the user is in keyboard-browse mode w/ at least one selected item
export const selectHasKeyboardSelection = (
  state: Pick<ActiveBoardRuntimeState, 'keyboardMode' | 'selection'>
): boolean => state.keyboardMode === 'browse' && state.selection.ids.length > 0

// cached fallback item ID keyed by tiers & unranked array refs;
// avoids O(items²) re-walk when identity is unchanged across updates
let cachedTiersRef: readonly Tier[] | null = null
let cachedUnrankedRef: readonly ItemId[] | null = null
let cachedFallback: ItemId | null = null

const getFallbackTabStop = (
  tiers: readonly Tier[],
  unrankedItemIds: readonly ItemId[]
): ItemId | null =>
{
  if (cachedTiersRef === tiers && cachedUnrankedRef === unrankedItemIds)
  {
    return cachedFallback
  }

  let next: ItemId | null = null
  for (const tier of tiers)
  {
    if (tier.itemIds.length > 0)
    {
      next = tier.itemIds[0]
      break
    }
  }

  if (next === null)
  {
    next = unrankedItemIds[0] ?? null
  }

  cachedTiersRef = tiers
  cachedUnrankedRef = unrankedItemIds
  cachedFallback = next
  return next
}

// derive the single keyboard tab-stop item ID for the whole board so each
// TierItem can compare against it w/o re-walking tiers per render
export const selectKeyboardTabStopItemId = (
  state: Pick<
    ActiveBoardRuntimeState,
    'keyboardFocusItemId' | 'tiers' | 'unrankedItemIds'
  >
): ItemId | null =>
{
  if (state.keyboardFocusItemId)
  {
    return state.keyboardFocusItemId
  }

  return getFallbackTabStop(state.tiers, state.unrankedItemIds)
}

interface LabelOverrideStatus
{
  // true when the board carries any non-empty label-settings override
  boardOverridden: boolean
  // ids of items w/ a non-empty per-tile label override
  itemOverrideIds: readonly ItemId[]
  // count of items w/ overrides; convenience for status text
  itemOverrideCount: number
  // true when either the board or any item carries an override
  hasAny: boolean
  // any layer (board.show or item.visible) explicitly forces a label visible.
  // gates Caption Placement editing while global showLabels is off
  hasVisibleOverride: boolean
}

// memoize selector output by (items, labels) pair so subscribers can shallow-
// compare the result. recomputes on items-ref changes but reuses the prior
// itemOverrideIds array w/ content-identical override sets
let cachedOverrideItems: Readonly<Record<ItemId, TierItem>> | null = null
let cachedOverrideLabels: BoardLabelSettings | undefined
let cachedOverrideResult: LabelOverrideStatus | null = null

const arraysEqual = (a: readonly ItemId[], b: readonly ItemId[]): boolean =>
{
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1)
  {
    if (a[i] !== b[i]) return false
  }
  return true
}

export const selectLabelOverrideStatus = (
  state: Pick<ActiveBoardRuntimeState, 'items' | 'labels'>
): LabelOverrideStatus =>
{
  if (
    cachedOverrideResult &&
    cachedOverrideItems === state.items &&
    cachedOverrideLabels === state.labels
  )
  {
    return cachedOverrideResult
  }

  const ids: ItemId[] = []
  let itemForcesVisible = false
  for (const id in state.items)
  {
    const item = state.items[id as ItemId]
    if (!item || isEmptyItemLabelOptions(item.labelOptions)) continue
    ids.push(id as ItemId)
    if (item.labelOptions?.visible === true) itemForcesVisible = true
  }

  const boardOverridden = !isEmptyBoardLabelSettings(state.labels)
  const hasVisibleOverride = state.labels?.show === true || itemForcesVisible
  const itemOverrideIds =
    cachedOverrideResult &&
    arraysEqual(ids, cachedOverrideResult.itemOverrideIds)
      ? cachedOverrideResult.itemOverrideIds
      : ids
  const itemOverrideCount = itemOverrideIds.length
  const next: LabelOverrideStatus =
    cachedOverrideResult &&
    cachedOverrideResult.boardOverridden === boardOverridden &&
    cachedOverrideResult.itemOverrideIds === itemOverrideIds &&
    cachedOverrideResult.hasVisibleOverride === hasVisibleOverride
      ? cachedOverrideResult
      : {
          boardOverridden,
          itemOverrideIds,
          itemOverrideCount,
          hasAny: boardOverridden || itemOverrideCount > 0,
          hasVisibleOverride,
        }

  cachedOverrideItems = state.items
  cachedOverrideLabels = state.labels
  cachedOverrideResult = next
  return next
}

// drop module-level caches on board swap so a new active board doesn't
// alias the previous board's tier/label memo entries
export const resetBoardSelectorCaches = (): void =>
{
  cachedTiersRef = null
  cachedUnrankedRef = null
  cachedFallback = null
  cachedOverrideItems = null
  cachedOverrideLabels = undefined
  cachedOverrideResult = null
}
