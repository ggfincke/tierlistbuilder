// src/features/workspace/boards/ui/tier-list/UnrankedPool.tsx
// workspace unranked pool — PoolFrame plus image import & template onboarding

import { Library } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
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
        renderFooter={({ isSearching }) =>
          itemCount === 0 && !boardLocked && !isSearching ? (
            <div className="mt-2 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.02)] px-3 py-3 text-center">
              <p className="text-xs text-[var(--t-text-muted)]">
                Don't have items yet? Start from a community template.
              </p>
              <Link
                to={TEMPLATES_ROUTE_PATH}
                className="focus-custom inline-flex items-center gap-1.5 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              >
                <Library className="h-3 w-3" strokeWidth={1.8} />
                Browse templates
              </Link>
            </div>
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
