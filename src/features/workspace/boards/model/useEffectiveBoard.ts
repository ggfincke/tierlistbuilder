// src/features/workspace/boards/model/useEffectiveBoard.ts
// derive tiers & unranked item IDs w/ drag preview overlay applied

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import {
  getEffectiveTiers,
  getEffectiveUnrankedItemIds,
} from '~/features/workspace/boards/dnd/dragSnapshot'
import { useActiveBoardStore } from './useActiveBoardStore'

// narrow subscription — only `tiers` & `dragPreview`, so UnrankedPool edits
// don't invalidate TierList's render path during drag
export const useEffectiveTiers = (): Tier[] =>
{
  const { storedTiers, dragPreview } = useActiveBoardStore(
    useShallow((state) => ({
      storedTiers: state.tiers,
      dragPreview: state.dragPreview,
    }))
  )
  return useMemo(
    () => getEffectiveTiers(storedTiers, dragPreview),
    [storedTiers, dragPreview]
  )
}

// narrow subscription — only `unrankedItemIds` & `dragPreview`, so TierList
// edits don't invalidate UnrankedPool's render path during drag
export const useEffectiveUnrankedItemIds = (): ItemId[] =>
{
  const { storedUnrankedItemIds, dragPreview } = useActiveBoardStore(
    useShallow((state) => ({
      storedUnrankedItemIds: state.unrankedItemIds,
      dragPreview: state.dragPreview,
    }))
  )
  return useMemo(
    () => getEffectiveUnrankedItemIds(storedUnrankedItemIds, dragPreview),
    [storedUnrankedItemIds, dragPreview]
  )
}
