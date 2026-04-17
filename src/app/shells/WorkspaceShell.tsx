// src/app/shells/WorkspaceShell.tsx
// full interactive workspace shell w/ board UI, modals, panels, & overlays

import { lazy, Suspense, useCallback, useState, type MouseEvent } from 'react'

import { useAppBootstrap } from '~/app/bootstrap/useAppBootstrap'
import { useThemeApplicator } from '~/app/bootstrap/useThemeApplicator'
import { BoardActionBar } from '~/features/workspace/boards/ui/BoardActionBar'
import { BoardManager } from '~/features/workspace/boards/ui/BoardManager'
import { BoardHeader } from '~/features/workspace/boards/ui/BoardHeader'
import { BulkActionBar } from '~/features/workspace/boards/ui/BulkActionBar'
import { TierList } from '~/features/workspace/boards/ui/TierList'
import { useBoardTransition } from '~/features/workspace/boards/model/useBoardTransition'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { ExportProgressOverlay } from '~/features/workspace/export/ui/ExportProgressOverlay'
import { useExportController } from '~/features/workspace/export/model/useExportController'
import { getResponsiveToolbarPosition } from '~/shared/layout/toolbarPosition'
import { getWorkspacePath } from '~/app/routes/pathname'
import { BoardSettingsModal } from '~/features/workspace/settings/ui/BoardSettingsModal'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { ShortcutsPanel } from '~/features/workspace/shortcuts/ui/ShortcutsPanel'
import { useGlobalShortcuts } from '~/features/workspace/shortcuts/model/useGlobalShortcuts'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useCloudSync } from '~/features/platform/sync/useCloudSync'
import { ConflictResolverModal } from '~/features/platform/sync/ConflictResolverModal'
import { CloudPullProgressOverlay } from '~/features/platform/sync/CloudPullProgressOverlay'
import { CLOUD_SYNC_ENABLED } from '~/features/platform/sync/cloudSyncConfig'
import { LiveRegion } from '~/shared/a11y/LiveRegion'
import { useAboveBreakpoint } from '~/shared/hooks/useViewportWidth'
import { ToastContainer } from '~/shared/notifications/ToastContainer'
import { ErrorBoundary } from '~/shared/ui/ErrorBoundary'
import type { ImageFormat } from '~/shared/types/export'

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

export const WorkspaceShell = () =>
{
  const appReady = useAppBootstrap()
  const paletteId = useCurrentPaletteId()
  const runtimeError = useActiveBoardStore((state) => state.runtimeError)
  const clearRuntimeError = useActiveBoardStore(
    (state) => state.clearRuntimeError
  )
  const addTier = useActiveBoardStore((state) => state.addTier)
  const resetBoard = useActiveBoardStore((state) => state.resetBoard)
  const rawToolbarPosition = useSettingsStore((state) => state.toolbarPosition)
  const boardBackgroundOverride = useSettingsStore(
    (state) => state.boardBackgroundOverride
  )
  const reducedMotion = useSettingsStore((state) => state.reducedMotion)
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

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [annotationImage, setAnnotationImage] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewFormat, setPreviewFormat] = useState<ImageFormat>('png')
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleAddTier = useCallback(
    () => addTier(paletteId),
    [addTier, paletteId]
  )
  const handleResetBoard = useCallback(
    () => resetBoard(paletteId),
    [paletteId, resetBoard]
  )
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [])
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [])
  const handleCloseStats = useCallback(() => setStatsOpen(false), [])
  const handleOpenStats = useCallback(() => setStatsOpen(true), [])
  const handleCloseShare = useCallback(() => setShareOpen(false), [])
  const handleOpenShare = useCallback(() => setShareOpen(true), [])
  const handleCloseAnnotation = useCallback(() => setAnnotationImage(null), [])

  const handleAnnotateExport = useCallback(() =>
  {
    void runAnnotatedExport().then((image) =>
    {
      if (image)
      {
        setAnnotationImage(image)
      }
    })
  }, [runAnnotatedExport])
  const handlePreviewExport = useCallback(() =>
  {
    void runPreviewRender().then((image) =>
    {
      if (image)
      {
        setPreviewImage(image)
        setPreviewOpen(true)
      }
    })
  }, [runPreviewRender])
  const handleClosePreview = useCallback(() =>
  {
    setPreviewOpen(false)
    setPreviewImage(null)
  }, [])
  const handlePreviewDownload = useCallback(() =>
  {
    void runExport(previewFormat)
    setPreviewOpen(false)
    setPreviewImage(null)
  }, [runExport, previewFormat])
  const handlePreviewCopy = useCallback(() =>
  {
    void runCopyToClipboard()
    setPreviewOpen(false)
    setPreviewImage(null)
  }, [runCopyToClipboard])
  const handlePreviewAnnotate = useCallback(() =>
  {
    setPreviewOpen(false)
    if (previewImage)
    {
      setAnnotationImage(previewImage)
      setPreviewImage(null)
    }
  }, [previewImage])
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

      {settingsOpen && (
        <ErrorBoundary section="settings">
          <BoardSettingsModal
            open={settingsOpen}
            onClose={handleCloseSettings}
          />
        </ErrorBoundary>
      )}
      {statsOpen && (
        <Suspense>
          <ErrorBoundary section="statistics">
            <StatsModal open={statsOpen} onClose={handleCloseStats} />
          </ErrorBoundary>
        </Suspense>
      )}
      {previewOpen && (
        <Suspense>
          <ExportPreviewModal
            open={previewOpen}
            onClose={handleClosePreview}
            previewDataUrl={previewImage}
            format={previewFormat}
            onFormatChange={setPreviewFormat}
            onDownload={handlePreviewDownload}
            onCopyToClipboard={handlePreviewCopy}
            onAnnotate={handlePreviewAnnotate}
            exporting={exportStatus !== null}
          />
        </Suspense>
      )}
      {annotationImage !== null && (
        <Suspense>
          <ErrorBoundary section="annotation">
            <AnnotationEditor
              open
              onClose={handleCloseAnnotation}
              backgroundImage={annotationImage}
            />
          </ErrorBoundary>
        </Suspense>
      )}
      {shareOpen && (
        <Suspense>
          <ErrorBoundary section="share">
            <ShareModal
              open={shareOpen}
              onClose={handleCloseShare}
              getSnapshot={() =>
                extractBoardData(useActiveBoardStore.getState())
              }
            />
          </ErrorBoundary>
        </Suspense>
      )}
      <BoardManager
        toolbarPosition={toolbarPosition}
        cloudEnabled={cloudEnabled}
        onSwitchBoard={transitionTo}
      />
      {exportAllProgress && (
        <ExportProgressOverlay
          current={exportAllProgress.current}
          total={exportAllProgress.total}
        />
      )}
      {showShortcutsPanel && <ShortcutsPanel onClose={closeShortcutsPanel} />}
      <BulkActionBar />
      <ConflictResolverModal user={signedInUser} />
      <CloudPullProgressOverlay />
      <ToastContainer reducedMotion={reducedMotion} />
      <LiveRegion />
    </main>
  )
}
