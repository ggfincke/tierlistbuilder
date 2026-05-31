// src/features/workspace/boards/ui/tier-list/UnrankedPool.tsx
// workspace unranked pool — PoolFrame plus image import

import { useImageImport } from '~/features/workspace/settings/model/useImageImport'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { selectActiveItemCount } from '~/features/workspace/boards/model/slices/selectors'
import { PoolFrame } from '~/features/workspace/boards/ui/tier-list/PoolFrame'
import { UploadDropzone } from '~/shared/ui/UploadDropzone'

export const UnrankedPool = () =>
{
  const boardLocked = usePreferencesStore((state) => state.boardLocked)
  const itemCount = useActiveBoardStore(selectActiveItemCount)

  const {
    inputRef: fileInputRef,
    isDraggingFiles,
    isProcessing,
    openFilePicker,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileInputChange,
  } = useImageImport()

  return (
    <>
      <PoolFrame
        emptyState={
          <UploadDropzone
            variant="empty"
            isDraggingFiles={isDraggingFiles}
            isProcessing={isProcessing}
            openFilePicker={openFilePicker}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
        }
        renderFooter={() =>
          itemCount === 0 && !boardLocked ? (
            <p className="mt-2 text-center text-xs text-[var(--t-text-muted)]">
              Add images from your device to start ranking locally.
            </p>
          ) : null
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />
    </>
  )
}
