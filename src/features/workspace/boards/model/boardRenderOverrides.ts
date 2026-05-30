// src/features/workspace/boards/model/boardRenderOverrides.ts
// non-persisted render override context & hooks for borrowed board surfaces

import { createContext, useContext } from 'react'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

export interface BoardRenderOverrides
{
  itemSize?: ItemSize | null
}

export const BoardRenderOverridesContext =
  createContext<BoardRenderOverrides | null>(null)

export const useBoardItemSize = (): ItemSize =>
{
  const override = useContext(BoardRenderOverridesContext)?.itemSize ?? null
  const persisted = usePreferencesStore((state) => state.itemSize)
  return override ?? persisted
}
