// src/features/workspace/preview/ui/ItemPreviewModal.tsx
// fullscreen-ish lightbox for inspecting an item's source image at large size

import { useId } from 'react'
import { X } from 'lucide-react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import { getRenderImageRefs, hasAnyImageRef } from '~/shared/lib/imageRefs'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'

interface ItemPreviewModalProps
{
  itemId: ItemId
  onClose: () => void
}

export const ItemPreviewModal = ({
  itemId,
  onClose,
}: ItemPreviewModalProps) =>
{
  const item = useActiveBoardStore((state) => state.items[itemId])
  const titleId = useId()

  // resolve highest-quality variant; fall back to tile/preview if source not
  // cached yet (cloud fetch kicked off inside useImageUrl)
  const refs = item
    ? getRenderImageRefs(item, 'editor')
    : { primary: undefined, fallback: undefined }
  const primaryUrl = useImageUrl(
    refs.primary?.ref.hash,
    refs.primary?.ref.cloudMediaExternalId,
    refs.primary?.variant
  )
  const fallbackUrl = useImageUrl(
    refs.fallback?.ref.hash,
    refs.fallback?.ref.cloudMediaExternalId,
    refs.fallback?.variant
  )
  const imageUrl = primaryUrl ?? fallbackUrl

  // item may have been deleted while preview was open — bail rather than
  // render a stale shell
  if (!item)
  {
    return (
      <BaseModal
        open
        onClose={onClose}
        ariaLabel="Item preview"
        panelClassName="w-full max-w-sm p-4"
      >
        <p className="text-sm text-[var(--t-text-muted)]">
          This item is no longer available.
        </p>
      </BaseModal>
    )
  }

  const label = item.label ?? 'Untitled item'
  const altText = item.altText ?? item.label ?? 'Item preview'
  const showImage = hasAnyImageRef(item)

  return (
    <BaseModal
      open
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col gap-3 p-3 sm:p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <ModalHeader
          titleId={titleId}
          className="truncate text-base font-semibold text-[var(--t-text)] sm:text-lg"
        >
          {label}
        </ModalHeader>
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="focus-custom -mt-1 -mr-1 shrink-0 rounded p-1 text-[var(--t-text-faint)] transition hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex min-h-[40vh] flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/60">
        {showImage && imageUrl ? (
          <img
            src={imageUrl}
            alt={altText}
            className="max-h-[78dvh] max-w-full object-contain"
            draggable={false}
          />
        ) : showImage ? (
          // image bytes not yet decoded — show a quiet spinner so the panel
          // doesn't flash a "no image" message before warm-up resolves
          <span
            role="status"
            aria-live="polite"
            className="h-6 w-6 rounded-full border-2 border-[var(--t-border-secondary)] border-t-[var(--t-accent)] motion-safe:animate-spin"
          />
        ) : (
          <p className="px-6 py-8 text-sm text-[var(--t-text-muted)]">
            This item has no image to preview.
          </p>
        )}
      </div>

      {item.altText && item.altText !== item.label && (
        <p className="text-xs text-[var(--t-text-faint)]">
          <span className="font-semibold text-[var(--t-text-muted)]">Alt:</span>{' '}
          {item.altText}
        </p>
      )}
    </BaseModal>
  )
}
