// src/features/workspace/image-editor/ui/ImageEditorModalDialogs.tsx
// confirmation dialogs used by the image editor modal

import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { formatCountedWord } from '~/shared/lib/pluralize'
import type { GateProjection } from '~/features/workspace/image-editor/model/useImageEditorModalActions'

interface ImageEditorModalDialogsProps
{
  applyLabel: GateProjection
  autoCropAll: GateProjection
  ratioGuard: GateProjection
}

export const ImageEditorModalDialogs = ({
  applyLabel,
  autoCropAll,
  ratioGuard,
}: ImageEditorModalDialogsProps) => (
  <>
    <ConfirmDialog
      open={autoCropAll.open}
      title="Overwrite image adjustments?"
      description={`Auto-crop will replace ${formatCountedWord(autoCropAll.count, 'saved or pending adjustment')} in this view. Items already auto-cropped or untouched stay as they are.`}
      confirmText="Auto-crop all"
      variant="accent"
      onConfirm={autoCropAll.confirm}
      onCancel={autoCropAll.cancel}
    />
    <ConfirmDialog
      open={ratioGuard.open}
      title="Change board ratio?"
      description={`This will reflow every item to the new ratio. ${formatCountedWord(ratioGuard.count, 'item has a manual crop', 'items have manual crops')} that may need re-checking.`}
      confirmText="Change ratio"
      cancelText="Keep current"
      variant="accent"
      onConfirm={ratioGuard.confirm}
      onCancel={ratioGuard.cancel}
    />
    <ConfirmDialog
      open={applyLabel.open}
      title="Apply label settings to all items?"
      description={`This sets the board default label settings to match this item, and clears per-tile label overrides on ${formatCountedWord(applyLabel.count, 'other item')}. The board's text content stays per-item.`}
      confirmText="Apply to all"
      cancelText="Cancel"
      variant="accent"
      onConfirm={applyLabel.confirm}
      onCancel={applyLabel.cancel}
    />
  </>
)
