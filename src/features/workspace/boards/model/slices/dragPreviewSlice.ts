// src/features/workspace/boards/model/slices/dragPreviewSlice.ts
// drag preview slice — snapshot-based transient ordering during drag-&-drop

import {
  applyContainerSnapshotToTiers,
  createContainerSnapshot,
  isSnapshotConsistent,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { makeSelection } from '~/features/workspace/boards/model/runtime'
import { stripItemsFromContainers, stripItemsFromSnapshot } from './helpers'
import { pushUndo } from './undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  DragPreviewSlice,
} from './types'

export const createDragPreviewSlice: ActiveBoardSliceCreator<
  DragPreviewSlice
> = (set) => ({
  activeItemId: null,
  dragPreview: null,
  dragGroupIds: [],

  setActiveItemId: (itemId) =>
    set((state) =>
      state.activeItemId === itemId ? state : { activeItemId: itemId }
    ),

  beginDragPreview: (activeId) =>
    set((state) =>
    {
      if (state.dragPreview) return state

      const selected = state.selection.ids
      let dragGroupIds: ItemId[] = []

      if (activeId)
      {
        if (selected.includes(activeId))
        {
          // dragging a selected item — drag entire selection, primary first,
          // then the remaining selected items in selection order; filter out
          // any stale IDs that no longer reference live items
          dragGroupIds = [
            activeId,
            ...selected.filter(
              (id) => id !== activeId && state.items[id] !== undefined
            ),
          ]
        }
        else
        {
          // dragging a non-selected item — single-item drag, even if selection exists
          dragGroupIds = [activeId]
        }
      }

      // create snapshot & strip secondary items so their source tiles
      // disappear & visually collapse into the dragged stack
      let snapshot = createContainerSnapshot(state)
      if (dragGroupIds.length > 1)
      {
        snapshot = stripItemsFromSnapshot(
          snapshot,
          new Set(dragGroupIds.slice(1))
        )
      }

      return {
        dragPreview: snapshot,
        dragGroupIds,
      }
    }),

  updateDragPreview: (preview) =>
    set((state) =>
    {
      if (state.dragPreview === preview)
      {
        return state
      }

      return {
        dragPreview: preview,
      }
    }),

  commitDragPreview: () =>
    set((state) =>
    {
      if (!state.dragPreview) return state

      const groupIds = state.dragGroupIds
      const isMultiDrag = groupIds.length > 1

      // for multi-drag, skip consistency check (secondary items absent from snapshot);
      // otherwise verify the snapshot references the same item IDs as the live
      // state — protects against stale snapshots from mid-drag store resets
      if (!isMultiDrag && !isSnapshotConsistent(state.dragPreview, state))
      {
        return { dragPreview: null, dragGroupIds: [] }
      }

      // step 1: apply snapshot (positions the primary item)
      let tiers = applyContainerSnapshotToTiers(state.tiers, state.dragPreview)
      let unrankedItemIds = [...state.dragPreview.unrankedItemIds]

      if (isMultiDrag)
      {
        const primaryId = groupIds[0]
        const secondaryIds = groupIds.slice(1)
        const secondarySet = new Set(secondaryIds)

        // step 2: strip secondary items from all containers
        ;({ tiers, unrankedItemIds } = stripItemsFromContainers(
          { tiers, unrankedItemIds },
          secondarySet
        ))

        // step 3: find where the primary landed & insert secondaries after it
        let inserted = false
        for (let t = 0; t < tiers.length; t++)
        {
          const pos = tiers[t].itemIds.indexOf(primaryId)
          if (pos !== -1)
          {
            const itemIds = [...tiers[t].itemIds]
            itemIds.splice(pos + 1, 0, ...secondaryIds)
            tiers = tiers.map((tier, idx) =>
              idx === t ? { ...tier, itemIds } : tier
            )
            inserted = true
            break
          }
        }
        if (!inserted)
        {
          const pos = unrankedItemIds.indexOf(primaryId)
          if (pos !== -1)
          {
            unrankedItemIds.splice(pos + 1, 0, ...secondaryIds)
          }
        }
      }

      // preserve selection after multi-drag so the group stays selected on drop
      const dragSelectionUpdate: Partial<ActiveBoardStore> = isMultiDrag
        ? {
            selection: makeSelection([...groupIds]),
            lastClickedItemId: groupIds[groupIds.length - 1],
          }
        : {}

      const dragLabel =
        groupIds.length > 1 ? `Move ${groupIds.length} items` : 'Move item'

      return {
        ...(pushUndo(state, dragLabel) ?? {}),
        tiers,
        unrankedItemIds,
        dragPreview: null,
        dragGroupIds: [],
        ...dragSelectionUpdate,
        itemsManuallyMoved: true,
      }
    }),

  discardDragPreview: () => set({ dragPreview: null, dragGroupIds: [] }),
})
