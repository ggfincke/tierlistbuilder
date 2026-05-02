// src/shared/board-ui/labelSettings.ts
// shared board-label setting helpers used by editor & settings UI

import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'

export const resolveEffectiveShowLabels = (
  boardLabels: BoardLabelSettings | undefined,
  globalShowLabels: boolean
): boolean => boardLabels?.show ?? globalShowLabels

export const withBoardShowLabels = (
  boardLabels: BoardLabelSettings | undefined,
  show: boolean
): BoardLabelSettings => ({ ...(boardLabels ?? {}), show })
