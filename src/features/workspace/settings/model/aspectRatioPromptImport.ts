// src/features/workspace/settings/model/aspectRatioPromptImport.ts
// pure import-trigger helpers for the mixed-ratio prompt

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  getBoardItemAspectRatio,
  itemHasAspectMismatch,
} from '~/shared/board-ui/aspectRatio'

type PromptBoard = Pick<
  BoardSnapshot,
  'items' | 'itemAspectRatio' | 'aspectRatioPromptDismissed'
>

export const shouldOpenAspectRatioPromptAfterImport = (
  before: PromptBoard,
  after: PromptBoard
): boolean =>
{
  if (after.aspectRatioPromptDismissed) return false
  const boardRatio = getBoardItemAspectRatio(after)
  for (const [id, item] of Object.entries(after.items))
  {
    if (id in before.items) continue
    if (itemHasAspectMismatch(item, boardRatio)) return true
  }
  return false
}
