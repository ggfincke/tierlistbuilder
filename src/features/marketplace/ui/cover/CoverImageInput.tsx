// src/features/marketplace/ui/cover/CoverImageInput.tsx
// optional cover-image picker for the publish modal — gates picks through
// CoverImageEditor & emits {file, framing} once the author applies

import { Crop, ImagePlus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { SUPPORTED_IMAGE_MIME_TYPES } from '@tierlistbuilder/contracts/platform/media'
import type { TemplateCoverFraming } from '@tierlistbuilder/contracts/lib/coverMedia'

import { validateImageFile } from '~/features/platform/media/imageFileValidation'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

import { CoverImageEditor } from './CoverImageEditor'

export interface CoverImageInputValue
{
  file: File
  framing: TemplateCoverFraming
}

interface CoverImageInputProps
{
  value: CoverImageInputValue | null
  onChange: (next: CoverImageInputValue | null) => void
  onValidationError: (message: string | null) => void
}

const MIME_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',')

export const CoverImageInput = ({
  value,
  onChange,
  onValidationError,
}: CoverImageInputProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const previewFile = value?.file ?? null
  const previewUrl = useMemo(
    () => (previewFile ? URL.createObjectURL(previewFile) : null),
    [previewFile]
  )

  useEffect(
    () => () =>
    {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  const validateAndStage = useCallback(
    (next: File | null) =>
    {
      if (!next)
      {
        onValidationError(null)
        return
      }
      const validation = validateImageFile(next)
      if (!validation.ok)
      {
        onValidationError(validation.message)
        return
      }
      onValidationError(null)
      setPendingFile(next)
    },
    [onValidationError]
  )

  const handlePickerChange = (next: File | null) =>
  {
    validateAndStage(next)
    if (inputRef.current)
    {
      // reset so re-picking the same file after a cancel still fires onChange
      inputRef.current.value = ''
    }
  }

  const handleEditorApply = (
    framing: TemplateCoverFraming,
    file: File | undefined
  ) =>
  {
    const committed = file ?? pendingFile
    setPendingFile(null)
    if (!committed) return
    onChange({ file: committed, framing })
  }

  const handleEditorCancel = () =>
  {
    setPendingFile(null)
  }

  const handleEditCrop = () =>
  {
    if (!value) return
    setPendingFile(value.file)
  }

  const handleRemove = () =>
  {
    setPendingFile(null)
    onValidationError(null)
    onChange(null)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={MIME_ACCEPT}
        className="hidden"
        onChange={(e) => handlePickerChange(e.target.files?.[0] ?? null)}
      />
      {previewUrl && value ? (
        <div className="relative overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
          <img
            src={previewUrl}
            alt="Cover preview"
            className="h-32 w-full object-cover"
            draggable={false}
          />
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate text-xs text-[var(--t-text-muted)]">
              {value.file.name}
            </span>
            <div className="flex items-center gap-1.5">
              <SecondaryButton type="button" size="sm" onClick={handleEditCrop}>
                <Crop className="h-3 w-3" strokeWidth={1.8} />
                Edit framing
              </SecondaryButton>
              <SecondaryButton
                type="button"
                size="sm"
                tone="destructive"
                onClick={handleRemove}
              >
                <Trash2 className="h-3 w-3" strokeWidth={1.8} />
                Remove
              </SecondaryButton>
            </div>
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

      {pendingFile && (
        <CoverImageEditor
          open
          source={{ kind: 'file', file: pendingFile }}
          initialFraming={value?.framing ?? null}
          onCancel={handleEditorCancel}
          onApply={handleEditorApply}
        />
      )}
    </div>
  )
}
