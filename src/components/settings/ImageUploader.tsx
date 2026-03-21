// src/components/settings/ImageUploader.tsx
// drag-&-drop & click-to-upload zone — resizes & adds images to the board

import { useRef, useState } from 'react'

import { useTierListStore } from '../../store/useTierListStore'
import { processImageFiles } from '../../utils/imageResize'

export const ImageUploader = () =>
{
  const addItems = useTierListStore((state) => state.addItems)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)

  const inputRef = useRef<HTMLInputElement | null>(null)
  // true while the user is dragging files over the drop zone
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  // true while images are being decoded & resized
  const [isProcessing, setIsProcessing] = useState(false)

  // process a FileList or File array — filter, resize, & dispatch to store
  const handleFiles = async (incomingFiles: FileList | File[]) =>
  {
    const files = Array.from(incomingFiles)
    if (files.length === 0) return

    clearRuntimeError()
    setIsProcessing(true)

    try
    {
      const imageCount = files.filter((f) => f.type.startsWith('image/')).length
      const skippedCount = files.length - imageCount

      if (imageCount === 0)
      {
        setRuntimeError(
          'No image files were found. Please upload PNG, JPG, WEBP, or GIF files.'
        )
        return
      }

      const newItems = await processImageFiles(files)
      if (newItems.length > 0) addItems(newItems)

      if (skippedCount > 0)
      {
        setRuntimeError(
          `Skipped ${skippedCount} non-image file${skippedCount > 1 ? 's' : ''}.`
        )
      }
    }
    finally
    {
      setIsProcessing(false)
      setIsDraggingFiles(false)
    }
  }

  return (
    <section className="mt-3">
      {/* drop zone — also acts as a click target to open the file picker */}
      <div
        className={`flex min-h-20 cursor-pointer flex-col items-center justify-center border border-dashed p-4 text-center transition ${
          isDraggingFiles
            ? 'border-[var(--t-accent-hover)] bg-[color-mix(in_srgb,var(--t-accent-hover)_10%,transparent)] text-[var(--t-accent)]'
            : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)] hover:border-[var(--t-border-hover)]'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) =>
        {
          event.preventDefault()
          setIsDraggingFiles(true)
        }}
        onDragLeave={(event) =>
        {
          event.preventDefault()
          // only clear the flag when the pointer truly leaves the zone (not a child)
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          )
          {
            setIsDraggingFiles(false)
          }
        }}
        onDrop={(event) =>
        {
          event.preventDefault()
          void handleFiles(event.dataTransfer.files)
        }}
      >
        <p className="text-sm font-semibold">
          {isProcessing
            ? 'Processing images...'
            : 'Drop images here or click to upload'}
        </p>
        <p className="mt-1 text-xs text-[var(--t-text-faint)]">
          Images are resized and saved in localStorage.
        </p>
      </div>

      {/* hidden file input — triggered programmatically by drop zone clicks */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) =>
        {
          if (!event.target.files)
          {
            return
          }

          void handleFiles(event.target.files)
          // reset value so the same file can be re-selected after removal
          event.target.value = ''
        }}
      />
    </section>
  )
}
