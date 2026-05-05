// src/app/shells/WorkspaceModalLayer.tsx
// workspace modal & blocking-progress composition

import { lazy, useCallback } from 'react'

import type { ModalStack } from '~/app/shells/useModalStack'
import type { WorkspaceModalPayloads } from './workspaceModals'
import type { ImageFormat } from '~/features/workspace/export/model/runtime'
import type { ExportStatus } from '~/features/workspace/export/model/useExportController'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { AspectRatioIssueModal } from '~/features/workspace/settings/ui/AspectRatioIssueModal'
import { useImageEditorStore } from '~/features/workspace/imageEditor/model/useImageEditorStore'
import {
  loadImageEditorModal,
  preloadImageEditorModal,
} from '~/features/workspace/imageEditor/ui/loadImageEditorModal'
import { loadPublishModal } from '~/features/marketplace/components/loadPublishModal'
import { useItemPreviewStore } from '~/features/workspace/preview/model/useItemPreviewStore'
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
const ImageEditorModal = lazy(() =>
  loadImageEditorModal().then((m) => ({
    default: m.ImageEditorModal,
  }))
)
const BoardSettingsModal = lazy(() =>
  import('~/features/workspace/settings/ui/BoardSettingsModal').then((m) => ({
    default: m.BoardSettingsModal,
  }))
)
const PublishRankingModal = lazy(() =>
  import('~/features/marketplace/components/PublishRankingModal').then((m) => ({
    default: m.PublishRankingModal,
  }))
)
const PublishTemplateModal = lazy(() =>
  loadPublishModal().then((m) => ({ default: m.PublishModal }))
)
const ShortcutsPanel = lazy(() =>
  import('~/features/workspace/shortcuts/ui/ShortcutsPanel').then((m) => ({
    default: m.ShortcutsPanel,
  }))
)
const ItemPreviewModal = lazy(() =>
  import('~/features/workspace/preview/ui/ItemPreviewModal').then((m) => ({
    default: m.ItemPreviewModal,
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
  exportStatus: ExportStatus
  exportAllProgress: ExportProgress | null
  imageFormat: ImageFormat
  onImageFormatChange: (format: ImageFormat) => void
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
  imageFormat,
  onImageFormatChange,
  onPreviewDownload,
  onPreviewCopy,
  onPreviewAnnotate,
  showShortcutsPanel,
  onCloseShortcutsPanel,
}: WorkspaceModalLayerProps) =>
{
  const { state: modalState, close: closeModal } = modalStack
  const imageEditorOpen = useImageEditorStore((state) => state.isOpen)
  const itemPreviewOpen = useItemPreviewStore((state) => state.isOpen)
  const itemPreviewItemId = useItemPreviewStore((state) => state.itemId)
  const closeItemPreview = useItemPreviewStore((state) => state.close)

  const handleCloseSettings = useCallback(
    () => closeModal('settings'),
    [closeModal]
  )
  const handleOpenImageEditorMismatched = useCallback(
    () => useImageEditorStore.getState().open({ filter: 'mismatched' }),
    []
  )
  const handleImageEditorIntent = useCallback(
    () => preloadImageEditorModal(),
    []
  )
  const handleCloseStats = useCallback(() => closeModal('stats'), [closeModal])
  const handleCloseShare = useCallback(() => closeModal('share'), [closeModal])
  const handleClosePublishRanking = useCallback(
    () => closeModal('publishRanking'),
    [closeModal]
  )
  const handleClosePublishTemplate = useCallback(
    () => closeModal('publishTemplate'),
    [closeModal]
  )
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
            format={imageFormat}
            onFormatChange={onImageFormatChange}
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
      <LazyModalSlot when={modalState.publishRanking} section="publish ranking">
        {(publishRanking) => (
          <PublishRankingModal
            open
            onClose={handleClosePublishRanking}
            boardExternalId={publishRanking.payload.boardExternalId}
            defaultTitle={publishRanking.payload.defaultTitle}
          />
        )}
      </LazyModalSlot>
      <LazyModalSlot
        when={modalState.publishTemplate}
        section="publish template"
      >
        {(publishTemplate) => (
          <PublishTemplateModal
            open
            onClose={handleClosePublishTemplate}
            initialBoardExternalId={
              publishTemplate.payload.initialBoardExternalId
            }
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
      <AspectRatioIssueModal
        onAdjustEach={handleOpenImageEditorMismatched}
        onAdjustEachIntent={handleImageEditorIntent}
      />
      <LazyModalSlot when={imageEditorOpen} section="image editor">
        {() => <ImageEditorModal />}
      </LazyModalSlot>
      <LazyModalSlot
        when={itemPreviewOpen && itemPreviewItemId ? itemPreviewItemId : null}
        section="item preview"
      >
        {(itemId) => (
          <ItemPreviewModal itemId={itemId} onClose={closeItemPreview} />
        )}
      </LazyModalSlot>
    </>
  )
}
