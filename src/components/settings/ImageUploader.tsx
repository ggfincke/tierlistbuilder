// src/components/settings/ImageUploader.tsx
// drag-and-drop & click-to-upload zone — resizes & adds images to the board
import { useRef, useState } from 'react'

import { useTierListStore } from '../../store/useTierListStore'
import { resizeImageFile } from '../../utils/imageResize'

// strip the file extension to derive a display label from a filename
const getFileLabel = (filename: string) => filename.replace(/\.[^.]+$/, '')

export const ImageUploader = () => {
  const addItems = useTierListStore((state) => state.addItems)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)

  const inputRef = useRef<HTMLInputElement | null>(null)
  // true while the user is dragging files over the drop zone
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  // true while images are being decoded & resized
  const [isProcessing, setIsProcessing] = useState(false)

  // process a FileList or File array — filter, resize, & dispatch to store
  const handleFiles = async (incomingFiles: FileList | File[]) => {
    const files = Array.from(incomingFiles)
    if (files.length === 0) {
      return
    }

    clearRuntimeError()
    setIsProcessing(true)

    try {
      // filter down to image MIME types only
      const images = files.filter((file) => file.type.startsWith('image/'))
      const skippedCount = files.length - images.length

      if (images.length === 0) {
        setRuntimeError('No image files were found. Please upload PNG, JPG, WEBP, or GIF files.')
        return
      }

      // resize all images in parallel and collect successful results
      const newItems = (
        await Promise.all(
          images.map(async (imageFile) => {
            try {
              const imageUrl = await resizeImageFile(imageFile)
              return { imageUrl, label: getFileLabel(imageFile.name) }
            } catch {
              setRuntimeError(`Could not process ${imageFile.name}. Try another image.`)
              return null
            }
          }),
        )
      ).filter((item): item is { imageUrl: string; label: string } => item !== null)

      if (newItems.length > 0) {
        addItems(newItems)
      }

      // warn about any non-image files that were skipped
      if (skippedCount > 0) {
        setRuntimeError(`Skipped ${skippedCount} non-image file${skippedCount > 1 ? 's' : ''}.`)
      }
    } finally {
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
            ? 'border-sky-400 bg-sky-400/10 text-sky-200'
            : 'border-[#555] bg-[#2b2b2b] text-[#aaa] hover:border-[#777]'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDraggingFiles(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          // only clear the flag when the pointer truly leaves the zone (not a child)
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDraggingFiles(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          void handleFiles(event.dataTransfer.files)
        }}
      >
        <p className="text-sm font-semibold">
          {isProcessing ? 'Processing images...' : 'Drop images here or click to upload'}
        </p>
        <p className="mt-1 text-xs text-[#888]">Images are resized and saved in localStorage.</p>
      </div>

      {/* hidden file input — triggered programmatically by drop zone clicks */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (!event.target.files) {
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
