// src/features/workspace/export/ui/ExportPreviewModal.tsx
// export preview modal — shows rendered board image before download w/ format selector

import { useId, useRef, useState } from 'react'
import { Check, Copy, Download, Highlighter } from 'lucide-react'

import type { ImageFormat } from '~/shared/types/export'
import {
  FORMAT_LABELS,
  IMAGE_FORMATS,
} from '~/features/workspace/export/lib/constants'
import { useClipboardCopy } from '~/shared/hooks/useClipboardCopy'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

interface ExportPreviewModalProps
{
  open: boolean
  onClose: () => void
  // pre-rendered data URL of the board (PNG for preview)
  previewDataUrl: string | null
  // active image format selection
  format: ImageFormat
  onFormatChange: (format: ImageFormat) => void
  onDownload: () => void
  onCopyToClipboard: () => void
  onAnnotate: () => void
  // true while a download or copy is in progress
  exporting: boolean
}

export const ExportPreviewModal = ({
  open,
  onClose,
  previewDataUrl,
  format,
  onFormatChange,
  onDownload,
  onCopyToClipboard,
  onAnnotate,
  exporting,
}: ExportPreviewModalProps) =>
{
  const titleId = useId()
  const { copied, copy } = useClipboardCopy()
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgError, setImgError] = useState(false)

  const handleCopy = () =>
  {
    if (previewDataUrl)
    {
      void copy(previewDataUrl)
    }
    onCopyToClipboard()
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-3xl flex-col p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
          Export Preview
        </h2>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      {/* preview image */}
      <div className="mb-3 flex max-h-[60vh] min-h-[12rem] items-center justify-center overflow-auto rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
        {previewDataUrl && !imgError ? (
          <img
            key={previewDataUrl}
            ref={imgRef}
            src={previewDataUrl}
            alt="Board export preview"
            className="max-h-[60vh] max-w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <p className="py-12 text-sm text-[var(--t-text-muted)]">
            {imgError ? 'Failed to render preview.' : 'Rendering preview…'}
          </p>
        )}
      </div>

      {/* format selector & actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {IMAGE_FORMATS.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onFormatChange(fmt)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                format === fmt
                  ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'
                  : 'bg-[var(--t-bg-surface)] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)]'
              }`}
            >
              {FORMAT_LABELS[fmt]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <SecondaryButton
            variant="surface"
            onClick={onAnnotate}
            disabled={exporting || !previewDataUrl}
          >
            <Highlighter className="h-3.5 w-3.5" />
            Annotate
          </SecondaryButton>
          <SecondaryButton
            variant="surface"
            onClick={handleCopy}
            disabled={exporting || !previewDataUrl}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--t-accent)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </SecondaryButton>
          <SecondaryButton
            variant="surface"
            onClick={onDownload}
            disabled={exporting || !previewDataUrl}
          >
            <Download className="h-3.5 w-3.5" />
            Download {FORMAT_LABELS[format]}
          </SecondaryButton>
        </div>
      </div>
    </BaseModal>
  )
}
