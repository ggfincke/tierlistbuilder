// src/app/shells/WorkspaceModalLayer.tsx
// workspace modal & blocking-progress composition

import { lazy, useCallback } from 'react'

import type { ModalStack } from '~/app/shells/useModalStack'
import type { WorkspaceModalPayloads } from './workspaceModals'
import type { ImageFormat } from '~/features/workspace/export/model/runtime'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { AspectRatioIssueModal } from '~/features/workspace/settings/ui/AspectRatioIssueModal'
import { ImageEditorModal } from '~/features/workspace/imageEditor/ui/ImageEditorModal'
import { useImageEditorStore } from '~/features/workspace/imageEditor/model/useImageEditorStore'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'
import { ProgressOverlay } from '~/shared/overlay/ProgressOverlay'

const AnnotationEditor = lazy(() =>
  import('~/features/workspace/annotation/ui/AnnotationEditor').then((m) => ({
    default: m.AnnotationEditor,
  }))
)
const ExportPreviewModal = lazy(() =>
  import('~/features/workspace/export/ui/ExportPreviewModal').then((m) => ({
    default: m.ExportPreviewModal,
  }))
)
const StatsModal = lazy(() =>
  import('~/features/workspace/stats/ui/StatsModal').then((m) => ({
    default: m.StatsModal,
  }))
)
const ShareModal = lazy(() =>
  import('~/features/workspace/sharing/ui/ShareModal').then((m) => ({
    default: m.ShareModal,
  }))
)
const BoardSettingsModal = lazy(() =>
  import('~/features/workspace/settings/ui/BoardSettingsModal').then((m) => ({
    default: m.BoardSettingsModal,
  }))
)
const ShortcutsPanel = lazy(() =>
  import('~/features/workspace/shortcuts/ui/ShortcutsPanel').then((m) => ({
    default: m.ShortcutsPanel,
  }))
)

interface ExportProgress
{
  current: number
  total: number
}

interface WorkspaceModalLayerProps
{
  modalStack: ModalStack<WorkspaceModalPayloads>
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  exportAllProgress: ExportProgress | null
  previewFormat: ImageFormat
  onPreviewFormatChange: (format: ImageFormat) => void
  onPreviewDownload: () => void
  onPreviewCopy: () => void
  onPreviewAnnotate: () => void
  showShortcutsPanel: boolean
  onCloseShortcutsPanel: () => void
}

export const WorkspaceModalLayer = ({
  modalStack,
  exportStatus,
  exportAllProgress,
  previewFormat,
  onPreviewFormatChange,
  onPreviewDownload,
  onPreviewCopy,
  onPreviewAnnotate,
  showShortcutsPanel,
  onCloseShortcutsPanel,
}: WorkspaceModalLayerProps) =>
{
  const { state: modalState, close: closeModal } = modalStack

  const handleCloseSettings = useCallback(
    () => closeModal('settings'),
    [closeModal]
  )
  const handleOpenImageEditorMismatched = useCallback(
    () => useImageEditorStore.getState().open({ filter: 'mismatched' }),
    []
  )
  const handleCloseStats = useCallback(() => closeModal('stats'), [closeModal])
  const handleCloseShare = useCallback(() => closeModal('share'), [closeModal])
  const handleCloseAnnotation = useCallback(
    () => closeModal('annotation'),
    [closeModal]
  )
  const handleClosePreview = useCallback(
    () => closeModal('preview'),
    [closeModal]
  )

  return (
    <>
      <LazyModalSlot when={modalState.settings} section="settings">
        {(settings) => (
          <BoardSettingsModal
            open
            onClose={handleCloseSettings}
            initialTab={settings.payload}
          />
        )}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.stats} section="statistics">
        {() => <StatsModal open onClose={handleCloseStats} />}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.preview} section="export preview">
        {(preview) => (
          <ExportPreviewModal
            open
            onClose={handleClosePreview}
            previewDataUrl={preview.payload}
            format={previewFormat}
            onFormatChange={onPreviewFormatChange}
            onDownload={onPreviewDownload}
            onCopyToClipboard={onPreviewCopy}
            onAnnotate={onPreviewAnnotate}
            exporting={exportStatus !== null}
          />
        )}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.annotation} section="annotation">
        {(annotation) => (
          <AnnotationEditor
            open
            onClose={handleCloseAnnotation}
            backgroundImage={annotation.payload}
          />
        )}
      </LazyModalSlot>
      <LazyModalSlot when={modalState.share} section="share">
        {() => (
          <ShareModal
            open
            onClose={handleCloseShare}
            getSnapshot={() => extractBoardData(useActiveBoardStore.getState())}
          />
        )}
      </LazyModalSlot>
      {exportAllProgress && (
        <ProgressOverlay
          title="Exporting Boards"
          statusVerb="Exporting"
          progressLabel="Export progress"
          current={exportAllProgress.current}
          total={exportAllProgress.total}
        />
      )}
      <LazyModalSlot when={showShortcutsPanel} section="shortcuts">
        {() => <ShortcutsPanel onClose={onCloseShortcutsPanel} />}
      </LazyModalSlot>
      <AspectRatioIssueModal onAdjustEach={handleOpenImageEditorMismatched} />
      <ImageEditorModal />
    </>
  )
}
