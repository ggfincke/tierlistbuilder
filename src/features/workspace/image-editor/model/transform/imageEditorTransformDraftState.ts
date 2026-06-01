// src/features/workspace/image-editor/model/transform/imageEditorTransformDraftState.ts
// transform-typed view of the generic draft-state sync helper

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import { isSameItemTransform } from '~/shared/lib/imageTransform'
import {
  syncDraftState,
  type DraftState,
} from '~/features/workspace/image-editor/model/transform/useDebouncedDraft'

type ImageEditorTransformDraftState = DraftState<ItemTransform>

export const syncImageEditorTransformDraftState = (
  draftState: ImageEditorTransformDraftState,
  committed: ItemTransform
): ImageEditorTransformDraftState =>
  syncDraftState(draftState, committed, isSameItemTransform)
