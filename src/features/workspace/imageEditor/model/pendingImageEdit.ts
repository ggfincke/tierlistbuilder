// src/features/workspace/imageEditor/model/pendingImageEdit.ts
// shared pending image-editor transform edit contract

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'

export interface PendingImageEditorPaneEdit
{
  id: ItemId
  transform: ItemTransform | null
}
