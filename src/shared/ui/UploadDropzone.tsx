// src/shared/ui/UploadDropzone.tsx
// shared image upload dropzone used by settings & unranked empty state

interface UploadDropzoneProps
{
  variant?: 'panel' | 'empty'
  isDraggingFiles: boolean
  isProcessing: boolean
  openFilePicker: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export const UploadDropzone = ({
  variant = 'panel',
  isDraggingFiles,
  isProcessing,
  openFilePicker,
  onDragOver,
  onDragLeave,
  onDrop,
}: UploadDropzoneProps) =>
{
  const message = isProcessing
    ? 'Processing images...'
    : isDraggingFiles
      ? 'Drop images here'
      : 'Drop images here or click to upload'

  if (variant === 'empty')
  {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload images"
        className={`flex min-h-16 w-full cursor-pointer flex-col items-center justify-center text-center transition ${
          isDraggingFiles
            ? 'text-[var(--t-accent)]'
            : 'text-[var(--t-text-faint)] hover:text-[var(--t-text-muted)]'
        }`}
        onClick={openFilePicker}
        onKeyDown={(e) =>
        {
          if (e.key === 'Enter' || e.key === ' ')
          {
            e.preventDefault()
            openFilePicker()
          }
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <p className="text-sm">{message}</p>
        <p className="mt-1 text-xs text-[var(--t-text-muted)]">
          Square images (1:1) work best.
        </p>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload images"
      className={`flex min-h-20 cursor-pointer flex-col items-center justify-center border border-dashed p-4 text-center transition ${
        isDraggingFiles
          ? 'border-[var(--t-accent-hover)] bg-[color-mix(in_srgb,var(--t-accent-hover)_10%,transparent)] text-[var(--t-accent)]'
          : 'border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)] hover:border-[var(--t-border-hover)]'
      }`}
      onClick={openFilePicker}
      onKeyDown={(e) =>
      {
        if (e.key === 'Enter' || e.key === ' ')
        {
          e.preventDefault()
          openFilePicker()
        }
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <p className="text-sm font-semibold">{message}</p>
      <p className="mt-1 text-xs text-[var(--t-text-muted)]">
        Square images (1:1) work best.
      </p>
    </div>
  )
}
