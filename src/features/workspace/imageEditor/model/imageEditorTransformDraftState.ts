// src/features/workspace/imageEditor/model/imageEditorTransformDraftState.ts
// pure draft-state synchronization helpers for image-editor transforms

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import { isSameItemTransform } from '~/shared/lib/imageTransform'

export interface ImageEditorTransformDraftState
{
  working: ItemTransform
  committed: ItemTransform
}

export const syncImageEditorTransformDraftState = (
  draftState: ImageEditorTransformDraftState,
  committed: ItemTransform
): ImageEditorTransformDraftState =>
{
  if (isSameItemTransform(draftState.committed, committed))
  {
    return draftState
  }

  if (
    isSameItemTransform(draftState.working, draftState.committed) ||
    isSameItemTransform(draftState.working, committed)
  )
  {
    return { working: committed, committed }
  }

  return { working: draftState.working, committed }
}
