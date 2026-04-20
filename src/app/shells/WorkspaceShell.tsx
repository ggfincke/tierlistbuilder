// src/app/shells/WorkspaceShell.tsx
// full interactive workspace shell w/ board UI, modals, panels, & overlays

import { lazy, useCallback, useState, type MouseEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useAppBootstrap } from '~/app/bootstrap/useAppBootstrap'
import { useThemeApplicator } from '~/app/bootstrap/useThemeApplicator'
import { useModalStack } from '~/app/shells/useModalStack'
import { BoardActionBar } from '~/features/workspace/boards/ui/BoardActionBar'
import { BoardManager } from '~/features/workspace/boards/ui/BoardManager'
import { BoardHeader } from '~/features/workspace/boards/ui/BoardHeader'
import { BulkActionBar } from '~/features/workspace/boards/ui/BulkActionBar'
import { TierList } from '~/features/workspace/boards/ui/TierList'
import { useBoardTransition } from '~/features/workspace/boards/model/useBoardTransition'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { LazyModalSlot, ProgressOverlay } from '~/shared/overlay/Modal'
import { useExportController } from '~/features/workspace/export/model/useExportController'
import { getResponsiveToolbarPosition } from '~/shared/layout/toolbarPosition'
import { getWorkspacePath } from '~/app/routes/pathname'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { useGlobalShortcuts } from '~/features/workspace/shortcuts/model/useGlobalShortcuts'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useCloudSync } from '~/features/platform/sync/orchestration/useCloudSync'
import { ConflictResolverModal } from '~/features/workspace/boards/data/cloud/conflicts/ConflictResolverModal'
import { useCloudPullProgressStore } from '~/features/platform/sync/state/useCloudPullProgressStore'
import { CLOUD_SYNC_ENABLED } from '~/features/platform/sync/lib/cloudSyncConfig'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { useAboveBreakpoint } from '~/shared/hooks/useViewportWidth'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import type { ImageFormat } from '~/features/workspace/export/model/runtime'

type ModalPayloads = {
  settings: undefined
  stats: undefined
  share: undefined
  annotation: string
  preview: string
}

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

export const WorkspaceShell = () =>
{
  const appReady = useAppBootstrap()
  const paletteId = useCurrentPaletteId()
  const { runtimeError, clearRuntimeError, addTier, resetBoard } =
    useActiveBoardStore(
      useShallow((state) => ({
        runtimeError: state.runtimeError,
        clearRuntimeError: state.clearRuntimeError,
        addTier: state.addTier,
        resetBoard: state.resetBoard,
      }))
    )
  const {
    toolbarPosition: rawToolbarPosition,
    boardBackgroundOverride,
    reducedMotion,
  } = useSettingsStore(
    useShallow((state) => ({
      toolbarPosition: state.toolbarPosition,
      boardBackgroundOverride: state.boardBackgroundOverride,
      reducedMotion: state.reducedMotion,
    }))
  )
  const { current: cloudPullCurrent, total: cloudPullTotal } =
    useCloudPullProgressStore(
      useShallow((state) => ({ current: state.current, total: state.total }))
    )
  const aboveSm = useAboveBreakpoint()
  const toolbarPosition = getResponsiveToolbarPosition(
    rawToolbarPosition,
    aboveSm
  )

  useThemeApplicator()

  const authSession = useAuthSession()
  const signedInUser =
    authSession.status === 'signed-in' ? authSession.user : null
  const cloudEnabled = signedInUser !== null && CLOUD_SYNC_ENABLED
  useCloudSync(signedInUser)

  const { style: boardTransitionStyle, transitionTo } = useBoardTransition()
  const {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
    runAnnotatedExport,
    runPreviewRender,
  } = useExportController()

  const { showShortcutsPanel, closeShortcutsPanel } = useGlobalShortcuts({
    onExport: runExport,
  })

  const {
    state: modalState,
    open: openModal,
    close: closeModal,
  } = useModalStack<ModalPayloads>()
  const [previewFormat, setPreviewFormat] = useState<ImageFormat>('png')

  const handleAddTier = useCallback(
    () => addTier(paletteId),
    [addTier, paletteId]
  )
  const handleResetBoard = useCallback(
    () => resetBoard(paletteId),
    [paletteId, resetBoard]
  )
  const handleCloseSettings = useCallback(
    () => closeModal('settings'),
    [closeModal]
  )
  const handleOpenSettings = useCallback(
    () => openModal('settings'),
    [openModal]
  )
  const handleCloseStats = useCallback(() => closeModal('stats'), [closeModal])
  const handleOpenStats = useCallback(() => openModal('stats'), [openModal])
  const handleCloseShare = useCallback(() => closeModal('share'), [closeModal])
  const handleOpenShare = useCallback(() => openModal('share'), [openModal])
  const handleCloseAnnotation = useCallback(
    () => closeModal('annotation'),
    [closeModal]
  )

  const handleAnnotateExport = useCallback(() =>
  {
    void runAnnotatedExport().then((image) =>
    {
      if (image)
      {
        openModal('annotation', image)
      }
    })
  }, [openModal, runAnnotatedExport])
  const handlePreviewExport = useCallback(() =>
  {
    void runPreviewRender().then((image) =>
    {
      if (image)
      {
        openModal('preview', image)
      }
    })
  }, [openModal, runPreviewRender])
  const handleClosePreview = useCallback(
    () => closeModal('preview'),
    [closeModal]
  )
  const handlePreviewDownload = useCallback(() =>
  {
    void runExport(previewFormat)
    closeModal('preview')
  }, [closeModal, runExport, previewFormat])
  const handlePreviewCopy = useCallback(() =>
  {
    void runCopyToClipboard()
    closeModal('preview')
  }, [closeModal, runCopyToClipboard])
  const previewImage = modalState.preview?.payload
  const handlePreviewAnnotate = useCallback(() =>
  {
    closeModal('preview')
    if (previewImage)
    {
      openModal('annotation', previewImage)
    }
  }, [closeModal, openModal, previewImage])
  const handleSkipToBoard = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) =>
    {
      event.preventDefault()

      const board = document.getElementById('tier-list')

      if (!(board instanceof HTMLElement))
      {
        return
      }

      board.scrollIntoView({ block: 'start' })
      board.focus({ preventScroll: true })
      window.history.replaceState(null, '', '#tier-list')
    },
    []
  )

  if (!appReady)
  {
    return (
      <main
        id="app-shell"
        className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]"
      />
    )
  }

  return (
    <main
      id="app-shell"
      className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]"
      style={
        boardBackgroundOverride
          ? { backgroundColor: boardBackgroundOverride }
          : undefined
      }
    >
      <a
        href={`${getWorkspacePath()}#tier-list`}
        onClick={handleSkipToBoard}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--t-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--t-accent-foreground)] focus:shadow-lg"
      >
        Skip to board
      </a>
      <div className="app-content mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <BoardHeader />

        {runtimeError && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--t-destructive)_70%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)] px-3 py-2">
            <p className="text-sm text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]">
              {runtimeError}
            </p>
            <button
              type="button"
              className="rounded border border-[color-mix(in_srgb,var(--t-destructive-hover)_60%,transparent)] px-2 py-0.5 text-xs text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]"
              onClick={clearRuntimeError}
            >
              Dismiss
            </button>
          </div>
        )}

        <div style={boardTransitionStyle}>
          <ErrorBoundary section="the board">
            <TierList
              toolbar={
                <BoardActionBar
                  toolbarPosition={toolbarPosition}
                  cloudEnabled={cloudEnabled}
                  exportStatus={exportStatus}
                  exportingAll={exportAllProgress !== null}
                  onAddTier={handleAddTier}
                  onOpenSettings={handleOpenSettings}
                  onOpenStats={handleOpenStats}
                  onExport={runExport}
                  onCopyToClipboard={runCopyToClipboard}
                  onExportAll={runExportAll}
                  onAnnotateExport={handleAnnotateExport}
                  onPreviewExport={handlePreviewExport}
                  onShare={handleOpenShare}
                  onReset={handleResetBoard}
                />
              }
              toolbarPosition={toolbarPosition}
            />
          </ErrorBoundary>
        </div>
      </div>

      <LazyModalSlot when={modalState.settings} section="settings">
        {() => <BoardSettingsModal open onClose={handleCloseSettings} />}
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
            onFormatChange={setPreviewFormat}
            onDownload={handlePreviewDownload}
            onCopyToClipboard={handlePreviewCopy}
            onAnnotate={handlePreviewAnnotate}
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
      <BoardManager
        toolbarPosition={toolbarPosition}
        cloudEnabled={cloudEnabled}
        onSwitchBoard={transitionTo}
      />
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
        {() => <ShortcutsPanel onClose={closeShortcutsPanel} />}
      </LazyModalSlot>
      <BulkActionBar />
      <ConflictResolverModal user={signedInUser} />
      <ProgressOverlay
        title="Loading your boards"
        statusVerb="Downloading"
        progressLabel="Cloud pull progress"
        current={cloudPullCurrent}
        total={cloudPullTotal}
      />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
