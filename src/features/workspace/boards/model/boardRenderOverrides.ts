// src/features/workspace/boards/model/boardRenderOverrides.ts
// non-persisted render override context & hooks for borrowed board surfaces

import { createContext, useContext } from 'react'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'

export interface BoardRenderOverrides
{
  itemSize?: ItemSize | null
  paletteId?: PaletteId | null
}

export const BoardRenderOverridesContext =
  createContext<BoardRenderOverrides | null>(null)

export const useBoardItemSize = (): ItemSize =>
{
  const override = useContext(BoardRenderOverridesContext)?.itemSize ?? null
  const persisted = usePreferencesStore((state) => state.itemSize)
  return override ?? persisted
}

// borrowed surfaces (the showcase editor) pin a fixed palette so tier colors
// match the public render; real boards pass no override -> workspace palette
export const useBoardPaletteId = (): PaletteId =>
{
  const override = useContext(BoardRenderOverridesContext)?.paletteId ?? null
  const current = useCurrentPaletteId()
  return override ?? current
}
