// src/features/workspace/image-editor/ui/ImageEditorPaneHeader.tsx
// item title & aspect-ratio status chip for the editor pane

import { Crop } from 'lucide-react'

import type { TierItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  formatAspectRatio,
  itemHasAspectMismatch,
} from '~/shared/board-ui/aspectRatio'
import type { AutoCropStatus } from '~/features/workspace/image-editor/model/auto-crop/useImageEditorAutoCropItem'
import { SaveStatusIndicator } from '~/features/workspace/image-editor/ui/SaveStatusIndicator'

interface ImageEditorPaneHeaderProps
{
  autoCrop: () => void | Promise<void>
  autoCropStatus: AutoCropStatus
  boardAspectRatio: number
  hasImage: boolean
  isDirty: boolean
  item: TierItem
  labelDraft: string
  onCommitLabel: () => void
  onLabelDraftChange: (value: string) => void
  savedFlash: boolean
}

export const ImageEditorPaneHeader = ({
  autoCrop,
  autoCropStatus,
  boardAspectRatio,
  hasImage,
  isDirty,
  item,
  labelDraft,
  onCommitLabel,
  onLabelDraftChange,
  savedFlash,
}: ImageEditorPaneHeaderProps) =>
{
  const ratioLabel = item.aspectRatio
    ? formatAspectRatio(item.aspectRatio)
    : '-'
  const mismatched = itemHasAspectMismatch(item, boardAspectRatio)
  const boardRatioLabel = formatAspectRatio(boardAspectRatio)
  const ratioBadgeClass = mismatched
    ? 'border-[var(--t-warning)]/50 bg-[var(--t-warning)]/10 text-[var(--t-warning)]'
    : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]'
  const ratioBadgeActionableClass = mismatched
    ? 'cursor-pointer hover:border-[var(--t-warning)] hover:bg-[var(--t-warning)]/20 active:bg-[var(--t-warning)]/30'
    : 'cursor-pointer hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]'
  const ratioChipActionable =
    hasImage &&
    mismatched &&
    (autoCropStatus === 'ready' || autoCropStatus === 'pending')
  const ratioChipTitle = mismatched
    ? ratioChipActionable
      ? `Item is ${ratioLabel} - board is ${boardRatioLabel}. Click to auto-crop to fit.`
      : `Item is ${ratioLabel} - board is ${boardRatioLabel}. Crop or pick a new ratio.`
    : `Item & board both ${boardRatioLabel}`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-2 text-xs text-[var(--t-text-muted)]">
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="text"
          value={labelDraft}
          onChange={(event) => onLabelDraftChange(event.target.value)}
          onBlur={onCommitLabel}
          onKeyDown={(event) =>
          {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          placeholder="Untitled"
          aria-label="Item name"
          spellCheck={false}
          className="focus-custom min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1.5 py-0.5 font-medium text-[var(--t-text-secondary)] outline-none placeholder:text-[var(--t-text-faint)] hover:border-[var(--t-border-secondary)] focus-visible:border-[var(--t-border-hover)] focus-visible:bg-[var(--t-bg-surface)] focus-visible:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        />
        <SaveStatusIndicator dirty={isDirty} savedFlash={savedFlash} />
      </div>
      {hasImage &&
        (ratioChipActionable ? (
          <button
            type="button"
            onClick={autoCrop}
            className={`focus-custom inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ${ratioBadgeClass} ${ratioBadgeActionableClass}`}
            title={ratioChipTitle}
            aria-label={`Auto-crop ${ratioLabel} item to fit ${boardRatioLabel} board`}
          >
            <Crop aria-hidden="true" className="h-3 w-3" />
            <span>{ratioLabel}</span>
            <span aria-hidden="true">-&gt;</span>
            <span>{boardRatioLabel}</span>
          </button>
        ) : (
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums ${ratioBadgeClass}`}
            title={ratioChipTitle}
          >
            <span>{ratioLabel}</span>
            <span aria-hidden="true">-&gt;</span>
            <span>{boardRatioLabel}</span>
          </span>
        ))}
    </div>
  )
}
