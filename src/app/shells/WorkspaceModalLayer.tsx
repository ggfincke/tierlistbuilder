// src/app/shells/WorkspaceModalLayer.tsx
// workspace modal & blocking-progress composition

import { useCallback } from 'react'

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
import { loadPublishModal } from '~/features/marketplace/components/publish/loadPublishModal'
import { useItemPreviewStore } from '~/features/workspace/preview/model/useItemPreviewStore'
import { lazyNamed } from '~/shared/lib/lazyNamed'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'
import { ProgressOverlay } from '~/shared/overlay/ProgressOverlay'

const AnnotationEditor = lazyNamed(
  () => import('~/features/workspace/annotation/ui/AnnotationEditor'),
  'AnnotationEditor'
)
const ExportPreviewModal = lazyNamed(
  () => import('~/features/workspace/export/ui/ExportPreviewModal'),
  'ExportPreviewModal'
)
const StatsModal = lazyNamed(
  () => import('~/features/workspace/stats/ui/StatsModal'),
  'StatsModal'
)
const ShareModal = lazyNamed(
  () => import('~/features/workspace/sharing/ui/ShareModal'),
  'ShareModal'
)
const ImageEditorModal = lazyNamed(loadImageEditorModal, 'ImageEditorModal')
const BoardSettingsModal = lazyNamed(
  () => import('~/features/workspace/settings/ui/BoardSettingsModal'),
  'BoardSettingsModal'
)
const PublishRankingModal = lazyNamed(
  () => import('~/features/marketplace/components/publish/PublishRankingModal'),
  'PublishRankingModal'
)
const PublishTemplateModal = lazyNamed(loadPublishModal, 'PublishModal')
const ShortcutsPanel = lazyNamed(
  () => import('~/features/workspace/shortcuts/ui/ShortcutsPanel'),
  'ShortcutsPanel'
)
const ItemPreviewModal = lazyNamed(
  () => import('~/features/workspace/preview/ui/ItemPreviewModal'),
  'ItemPreviewModal'
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
