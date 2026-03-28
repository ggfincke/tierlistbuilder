// src/components/settings/ImageUploader.tsx
// drag-&-drop & click-to-upload zone — resizes & adds images to the board

import { useImageImport } from '../../hooks/useImageImport'

export const ImageUploader = () =>
{
  const {
    inputRef,
    isDraggingFiles,
    isProcessing,
    openFilePicker,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileInputChange,
  } = useImageImport()

  return (
    <section className="mt-3">
      {/* drop zone — also acts as a click target to open the file picker */}
      <div
        className={`flex min-h-20 cursor-pointer flex-col items-center justify-center border border-dashed p-4 text-center transition ${
          isDraggingFiles
            ? 'border-[var(--t-accent-hover)] bg-[color-mix(in_srgb,var(--t-accent-hover)_10%,transparent)] text-[var(--t-accent)]'
            : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)] hover:border-[var(--t-border-hover)]'
        }`}
        onClick={openFilePicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <p className="text-sm font-semibold">
          {isProcessing
            ? 'Processing images...'
            : 'Drop images here or click to upload'}
        </p>
        <p className="mt-1 text-xs text-[var(--t-text-faint)]">
          Square images (1:1) work best.
        </p>
      </div>

      {/* hidden file input — triggered programmatically by drop zone clicks */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />
    </section>
  )
}
