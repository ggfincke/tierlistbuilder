// src/features/marketplace/components/CoverImageInput.tsx
// optional cover-image picker for the publish modal — file input + preview;
// no file -> server defaults to a mosaic of items

import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'

import {
  MAX_IMAGE_BYTE_SIZE,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@tierlistbuilder/contracts/platform/media'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

interface CoverImageInputProps
{
  file: File | null
  onChange: (next: File | null) => void
  onValidationError: (message: string | null) => void
}

const MIME_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',')

export const CoverImageInput = ({
  file,
  onChange,
  onValidationError,
}: CoverImageInputProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  )

  // revoke the blob URL when the file changes or the component unmounts so
  // we never leak object URLs across rerenders
  useEffect(
    () => () =>
    {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  const validateAndSet = (next: File | null) =>
  {
    if (!next)
    {
      onChange(null)
      onValidationError(null)
      return
    }
    if (
      !(SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(next.type)
    )
    {
      onValidationError(
        `Unsupported image type. Allowed: ${SUPPORTED_IMAGE_MIME_TYPES.join(', ')}`
      )
      return
    }
    if (next.size > MAX_IMAGE_BYTE_SIZE)
    {
      onValidationError(
        `Image is too large (max ${Math.round(MAX_IMAGE_BYTE_SIZE / 1024 / 1024)}MB).`
      )
      return
    }
    onValidationError(null)
    onChange(next)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={MIME_ACCEPT}
        className="hidden"
        onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
          <img
            src={previewUrl}
            alt="Cover preview"
            className="h-32 w-full object-cover"
            draggable={false}
          />
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate text-xs text-[var(--t-text-muted)]">
              {file?.name}
            </span>
            <SecondaryButton
              type="button"
              size="sm"
              tone="destructive"
              onClick={() => validateAndSet(null)}
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.8} />
              Remove
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="focus-custom flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.02)] px-4 py-6 text-sm text-[var(--t-text-secondary)] transition hover:border-[var(--t-border-hover)] hover:bg-[rgb(var(--t-overlay)/0.05)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ImagePlus className="h-5 w-5" strokeWidth={1.8} />
          <span className="font-medium">Upload a cover image</span>
          <span className="text-xs text-[var(--t-text-faint)]">
            Optional — defaults to a mosaic of your items
          </span>
        </button>
      )}
    </div>
  )
}
