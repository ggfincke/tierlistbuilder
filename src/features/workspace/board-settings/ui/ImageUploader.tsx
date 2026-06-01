// src/features/workspace/board-settings/ui/ImageUploader.tsx
// drag-&-drop & click-to-upload zone for board images

import { useImageImport } from '~/features/workspace/board-settings/model/useImageImport'
import { UploadDropzone } from '~/shared/ui/UploadDropzone'

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
      <UploadDropzone
        isDraggingFiles={isDraggingFiles}
        isProcessing={isProcessing}
        openFilePicker={openFilePicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />

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
