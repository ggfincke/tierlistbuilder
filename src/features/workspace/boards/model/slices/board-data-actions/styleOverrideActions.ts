// src/features/workspace/boards/model/slices/board-data-actions/styleOverrideActions.ts
// per-board style override setters for palette, text style, & page background

import {
  boardAutoPlateSettingsEqual,
  type BoardAutoPlateSettings,
} from '@tierlistbuilder/contracts/workspace/board'
import type {
  ActiveBoardSliceCreator,
  BoardDataSlice,
} from '~/features/workspace/boards/model/slices/types'

type StyleOverrideActions = Pick<
  BoardDataSlice,
  | 'setBoardPaletteOverride'
  | 'setBoardTextStyleOverride'
  | 'setBoardPageBackground'
  | 'setBoardAutoPlate'
>

type SliceArgs = Parameters<ActiveBoardSliceCreator<BoardDataSlice>>
type StyleOverrideKey = 'paletteId' | 'textStyleId' | 'pageBackground'
type StyleOverrideSetter<K extends StyleOverrideKey> = (
  value: NonNullable<BoardDataSlice[K]> | null
) => void

const createNullableOverrideSetter =
  <K extends StyleOverrideKey>(
    set: SliceArgs[0],
    key: K
  ): StyleOverrideSetter<K> =>
  (value) =>
    set((state) =>
    {
      const next = value ?? undefined
      if (state[key] === next) return state
      return { [key]: next } as Partial<BoardDataSlice>
    })

export const createStyleOverrideActions = (
  set: SliceArgs[0]
): StyleOverrideActions => ({
  setBoardPaletteOverride: createNullableOverrideSetter(set, 'paletteId'),
  setBoardTextStyleOverride: createNullableOverrideSetter(set, 'textStyleId'),
  setBoardPageBackground: createNullableOverrideSetter(set, 'pageBackground'),
  setBoardAutoPlate: (settings: BoardAutoPlateSettings | null) =>
    set((state) =>
    {
      const next = settings ?? undefined
      if (boardAutoPlateSettingsEqual(state.autoPlate, next)) return state
      return { autoPlate: next } as Partial<BoardDataSlice>
    }),
})
