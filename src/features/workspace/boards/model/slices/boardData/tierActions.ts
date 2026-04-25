// src/features/workspace/boards/model/slices/boardData/tierActions.ts
// tier action group for tier CRUD, ordering, labels, & row colors

import { announce } from '~/shared/a11y/announce'
import { clamp } from '~/shared/lib/math'
import { areTierColorSpecsEqual } from '~/shared/theme/tierColors'
import { createNewTier } from '~/features/workspace/boards/model/boardSnapshot'
import { mapTier, withUndo } from '../undoSlice'
import type {
  ActiveBoardSliceCreator,
  ActiveBoardStore,
  BoardDataSlice,
} from '../types'

type TierActions = Pick<
  BoardDataSlice,
  | 'addTier'
  | 'renameTier'
  | 'setTierDescription'
  | 'recolorTier'
  | 'recolorTierRow'
  | 'reorderTier'
  | 'reorderTierByIndex'
  | 'deleteTier'
  | 'clearTierItems'
  | 'addTierAt'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>

const reorderTiersByIndex = (
  state: ActiveBoardStore,
  fromIndex: number,
  toIndex: number
): Partial<ActiveBoardStore> =>
{
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= state.tiers.length ||
    toIndex < 0 ||
    toIndex >= state.tiers.length
  )
  {
    return state
  }

  const nextTiers = [...state.tiers]
  const [moved] = nextTiers.splice(fromIndex, 1)
  nextTiers.splice(toIndex, 0, moved)

  return withUndo(state, { tiers: nextTiers }, 'Reorder tiers')
}

export const createTierActions = (
  set: SliceArgs[0],
  get: SliceArgs[1]
): TierActions => ({
  addTier: (paletteId) =>
  {
    set((state) =>
      withUndo(
        state,
        {
          tiers: [...state.tiers, createNewTier(paletteId, state.tiers.length)],
        },
        'Add tier'
      )
    )
    announce('Tier added')
  },

  renameTier: (tierId, name) =>
    set(
      (state) =>
        mapTier(state, tierId, 'Rename tier', (tier) =>
        {
          const nextName = name.trim() || tier.name
          return nextName === tier.name ? null : { ...tier, name: nextName }
        }) ?? state
    ),

  setTierDescription: (tierId, description) =>
    set(
      (state) =>
        mapTier(state, tierId, 'Edit tier description', (tier) =>
        {
          const nextDescription = description.trim() || undefined
          return nextDescription === tier.description
            ? null
            : { ...tier, description: nextDescription }
        }) ?? state
    ),

  recolorTier: (tierId, colorSpec) =>
    set(
      (state) =>
        mapTier(state, tierId, 'Recolor tier', (tier) =>
          areTierColorSpecsEqual(tier.colorSpec, colorSpec)
            ? null
            : { ...tier, colorSpec }
        ) ?? state
    ),

  recolorTierRow: (tierId, rowColorSpec) =>
    set(
      (state) =>
        mapTier(
          state,
          tierId,
          rowColorSpec === null ? 'Clear row color' : 'Recolor row',
          (tier) =>
          {
            if (
              (rowColorSpec === null && tier.rowColorSpec === undefined) ||
              areTierColorSpecsEqual(tier.rowColorSpec, rowColorSpec)
            )
            {
              return null
            }
            if (rowColorSpec === null)
            {
              const { rowColorSpec: _rowColorSpec, ...rest } = tier
              return rest
            }
            return { ...tier, rowColorSpec }
          }
        ) ?? state
    ),

  reorderTier: (tierId, direction) =>
    set((state) =>
    {
      const tierIndex = state.tiers.findIndex((tier) => tier.id === tierId)

      if (tierIndex < 0)
      {
        return state
      }

      const targetIndex = direction === 'up' ? tierIndex - 1 : tierIndex + 1

      return reorderTiersByIndex(state, tierIndex, targetIndex)
    }),

  reorderTierByIndex: (fromIndex, toIndex) =>
    set((state) => reorderTiersByIndex(state, fromIndex, toIndex)),

  deleteTier: (tierId) =>
  {
    const tierName = get().tiers.find((tier) => tier.id === tierId)?.name
    set((state) =>
    {
      if (state.tiers.length <= 1)
      {
        return {
          runtimeError: 'At least one tier must remain.',
        }
      }

      const tier = state.tiers.find((entry) => entry.id === tierId)

      if (!tier)
      {
        return state
      }

      return {
        ...withUndo(state, {}, 'Delete tier'),
        tiers: state.tiers.filter((entry) => entry.id !== tierId),
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    })
    announce(`Tier ${tierName ?? ''} deleted`)
  },

  clearTierItems: (tierId) =>
    set((state) =>
    {
      const tier = state.tiers.find((entry) => entry.id === tierId)

      if (!tier || tier.itemIds.length === 0)
      {
        return state
      }

      return {
        ...withUndo(state, {}, 'Clear tier'),
        tiers: state.tiers.map((entry) =>
          entry.id === tierId ? { ...entry, itemIds: [] } : entry
        ),
        unrankedItemIds: [...tier.itemIds, ...state.unrankedItemIds],
      }
    }),

  addTierAt: (index, paletteId) =>
    set((state) =>
    {
      const clampedIndex = clamp(index, 0, state.tiers.length)
      const nextTiers = [...state.tiers]
      nextTiers.splice(
        clampedIndex,
        0,
        createNewTier(paletteId, state.tiers.length)
      )

      return withUndo(state, { tiers: nextTiers }, 'Add tier')
    }),
})
