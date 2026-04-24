// src/features/workspace/boards/model/slices/selectionBulkOps.ts
// pure builders for multi-selection move & delete mutations

import type { ItemId, TierId } from '@tierlistbuilder/contracts/lib/ids'
import { pluralizeWord } from '~/shared/lib/pluralize'
import { EMPTY_SELECTION } from '~/features/workspace/boards/model/runtime'
import { stripItemsFromContainers } from './helpers'
import { withUndo } from './undoSlice'
import { buildRemoveItemsPatch } from './boardData/itemRemoval'
import type { ActiveBoardStore } from './types'

type SelectionMutation = {
  announcement: string
  patch: Partial<ActiveBoardStore>
}

type SelectionMoveTarget =
  | { kind: 'tier'; tierId: TierId }
  | { kind: 'unranked' }

const clearSelectionPatch = {
  selection: EMPTY_SELECTION,
  lastClickedItemId: null,
} satisfies Partial<ActiveBoardStore>

const getLiveSelectedIds = (state: ActiveBoardStore): ItemId[] =>
  state.selection.ids.filter((id) => state.items[id])

export const buildSelectedItemsMove = (
  state: ActiveBoardStore,
  target: SelectionMoveTarget
): SelectionMutation | null =>
{
  const selected = getLiveSelectedIds(state)
  if (selected.length === 0) return null

  const selectedSet = new Set(selected)
  const { tiers: strippedTiers, unrankedItemIds: strippedUnranked } =
    stripItemsFromContainers(state, selectedSet)

  if (target.kind === 'unranked')
  {
    const unrankedItemIds = [...strippedUnranked, ...selected]
    const moveLabel =
      selected.length === 1
        ? 'Move item to unranked'
        : `Move ${selected.length} items to unranked`

    return {
      announcement: `Moved ${selected.length} ${pluralizeWord(
        selected.length,
        'item'
      )} to unranked`,
      patch: {
        ...withUndo(
          state,
          { tiers: strippedTiers, unrankedItemIds },
          moveLabel
        ),
        ...clearSelectionPatch,
      },
    }
  }

  const tier = state.tiers.find((entry) => entry.id === target.tierId)
  if (!tier) return null

  const tiers = strippedTiers.map((entry) =>
    entry.id === target.tierId
      ? { ...entry, itemIds: [...entry.itemIds, ...selected] }
      : entry
  )
  const moveLabel =
    selected.length === 1
      ? `Move item to ${tier.name}`
      : `Move ${selected.length} items to ${tier.name}`

  return {
    announcement: `Moved ${selected.length} ${pluralizeWord(
      selected.length,
      'item'
    )} to ${tier.name}`,
    patch: {
      ...withUndo(
        state,
        { tiers, unrankedItemIds: strippedUnranked },
        moveLabel
      ),
      ...clearSelectionPatch,
    },
  }
}

export const buildSelectedItemsDelete = (
  state: ActiveBoardStore
): SelectionMutation | null =>
{
  const selected = getLiveSelectedIds(state)
  if (selected.length === 0) return null

  const deleteLabel =
    selected.length === 1 ? 'Delete item' : `Delete ${selected.length} items`
  const patch = buildRemoveItemsPatch(state, selected, deleteLabel)

  if (!patch) return null

  return {
    announcement: `Deleted ${selected.length} ${pluralizeWord(
      selected.length,
      'item'
    )}`,
    patch: {
      ...patch,
      ...clearSelectionPatch,
    },
  }
}
