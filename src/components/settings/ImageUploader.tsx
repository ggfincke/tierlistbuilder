// src/components/settings/ImageUploader.tsx
// drag-&-drop & click-to-upload zone — resizes & adds images to the board

import { useImageImport } from '../../hooks/useImageImport'
import { UploadDropzone } from '../ui/UploadDropzone'

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
      <UploadDropzone
        isDraggingFiles={isDraggingFiles}
        isProcessing={isProcessing}
        openFilePicker={openFilePicker}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />

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
