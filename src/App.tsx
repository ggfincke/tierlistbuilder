// src/App.tsx
// * root application component — shell composition, modal state, & global error banner

import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
} from 'react'

import { EmbedView } from './components/embed/EmbedView'
import { BoardActionBar } from './components/ui/BoardActionBar'
import { BoardManager } from './components/ui/BoardManager'
import { BulkActionBar } from './components/ui/BulkActionBar'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { ExportProgressOverlay } from './components/ui/ExportProgressOverlay'
import { LiveRegion } from './components/ui/LiveRegion'
import { ShortcutsPanel } from './components/ui/ShortcutsPanel'
import { ToastContainer } from './components/ui/ToastContainer'
import { TierList } from './components/board/TierList'
import { TierSettings } from './components/settings/TierSettings'
import { Toolbar } from './components/ui/Toolbar'

// lazy-loaded modals — rarely opened, heavy components
const AnnotationEditor = lazy(() =>
  import('./components/annotation/AnnotationEditor').then((m) => ({
    default: m.AnnotationEditor,
  }))
)
const ComparisonModal = lazy(() =>
  import('./components/comparison/ComparisonModal').then((m) => ({
    default: m.ComparisonModal,
  }))
)
const EmbedSnippetModal = lazy(() =>
  import('./components/ui/EmbedSnippetModal').then((m) => ({
    default: m.EmbedSnippetModal,
  }))
)
const ShareLinkModal = lazy(() =>
  import('./components/ui/ShareLinkModal').then((m) => ({
    default: m.ShareLinkModal,
  }))
)
const ExportPreviewModal = lazy(() =>
  import('./components/ui/ExportPreviewModal').then((m) => ({
    default: m.ExportPreviewModal,
  }))
)
const StatsModal = lazy(() =>
  import('./components/stats/StatsModal').then((m) => ({
    default: m.StatsModal,
  }))
)
import type { ImageFormat } from './types'
import { extractBoardData } from './domain/boardData'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useEmbedMode } from './hooks/useEmbedMode'
import { useBoardTransition } from './hooks/useBoardTransition'
import { useCurrentPaletteId } from './hooks/useCurrentPaletteId'
import { useExportController } from './hooks/useExportController'
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts'
import { useThemeApplicator } from './hooks/useThemeApplicator'
import { useAboveBreakpoint } from './hooks/useViewportWidth'
import { getResponsiveToolbarPosition } from './utils/menuPosition'
import { getShareUrl } from './utils/shareLink'
import { shareToTwitter } from './utils/socialShare'
import { useSettingsStore } from './store/useSettingsStore'
import { useTierListStore } from './store/useTierListStore'

function App()
{
  const isEmbed = useEmbedMode()
  const appReady = useAppBootstrap()
  const paletteId = useCurrentPaletteId()
  const runtimeError = useTierListStore((state) => state.runtimeError)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const addTier = useTierListStore((state) => state.addTier)
  const resetBoard = useTierListStore((state) => state.resetBoard)
  const rawToolbarPosition = useSettingsStore((state) => state.toolbarPosition)
  const boardBackgroundOverride = useSettingsStore(
    (state) => state.boardBackgroundOverride
  )
  const aboveSm = useAboveBreakpoint()
  const toolbarPosition = getResponsiveToolbarPosition(
    rawToolbarPosition,
    aboveSm
  )

  useThemeApplicator()

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
  const [shareLinkOpen, setShareLinkOpen] = useState(false)
  const [embedSnippetOpen, setEmbedSnippetOpen] = useState(false)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [annotationImage, setAnnotationImage] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewFormat, setPreviewFormat] = useState<ImageFormat>('png')
  const [previewOpen, setPreviewOpen] = useState(false)
  const handleAddTier = useMemo(
    () => () => addTier(paletteId),
    [addTier, paletteId]
  )
  const handleResetBoard = useMemo(
    () => () => resetBoard(paletteId),
    [paletteId, resetBoard]
  )
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [])
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [])
  const handleCloseStats = useCallback(() => setStatsOpen(false), [])
  const handleOpenStats = useCallback(() => setStatsOpen(true), [])
  const handleCloseShareLink = useCallback(() => setShareLinkOpen(false), [])
  const handleOpenShareLink = useCallback(() => setShareLinkOpen(true), [])
  const handleCloseEmbedSnippet = useCallback(
    () => setEmbedSnippetOpen(false),
    []
  )
  const handleOpenEmbedSnippet = useCallback(
    () => setEmbedSnippetOpen(true),
    []
  )
  const handleCloseComparison = useCallback(() => setComparisonOpen(false), [])
  const handleOpenComparison = useCallback(() => setComparisonOpen(true), [])
  const handleCloseAnnotation = useCallback(() => setAnnotationImage(null), [])

  const handleShareToTwitter = useCallback(async () =>
  {
    try
    {
      const data = extractBoardData(useTierListStore.getState())
      const url = await getShareUrl(data)
      const title = useTierListStore.getState().title
      shareToTwitter(`Check out my tier list: ${title}`, url)
    }
    catch
    {
      useTierListStore
        .getState()
        .setRuntimeError('Failed to generate share link.')
    }
  }, [])

  const handleAnnotateExport = useCallback(() =>
  {
    void runAnnotatedExport().then((img) =>
    {
      if (img) setAnnotationImage(img)
    })
  }, [runAnnotatedExport])
  const handlePreviewExport = useCallback(() =>
  {
    void runPreviewRender().then((img) =>
    {
      if (img)
      {
        setPreviewImage(img)
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

  // embed mode — render a minimal read-only board w/o the full app shell
  if (isEmbed)
  {
    return <EmbedView />
  }

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
        href="#tier-list"
        onClick={handleSkipToBoard}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--t-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--t-accent-foreground)] focus:shadow-lg"
      >
        Skip to board
      </a>
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <Toolbar />

        {/* inline error banner — shown for storage & export errors */}
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

        {/* board content — fades in when switching boards */}
        <div style={boardTransitionStyle}>
          <ErrorBoundary section="the board">
            <TierList
              toolbar={
                <BoardActionBar
                  toolbarPosition={toolbarPosition}
                  exportStatus={exportStatus}
                  exportingAll={exportAllProgress !== null}
                  onAddTier={handleAddTier}
                  onOpenSettings={handleOpenSettings}
                  onOpenStats={handleOpenStats}
                  onOpenComparison={handleOpenComparison}
                  onExport={runExport}
                  onCopyToClipboard={runCopyToClipboard}
                  onExportAll={runExportAll}
                  onOpenShareLink={handleOpenShareLink}
                  onOpenEmbedSnippet={handleOpenEmbedSnippet}
                  onShareToTwitter={handleShareToTwitter}
                  onAnnotateExport={handleAnnotateExport}
                  onPreviewExport={handlePreviewExport}
                  onReset={handleResetBoard}
                />
              }
              toolbarPosition={toolbarPosition}
            />
          </ErrorBoundary>
        </div>
      </div>

      <ErrorBoundary section="settings">
        <TierSettings open={settingsOpen} onClose={handleCloseSettings} />
      </ErrorBoundary>
      {statsOpen && (
        <Suspense>
          <ErrorBoundary section="statistics">
            <StatsModal open={statsOpen} onClose={handleCloseStats} />
          </ErrorBoundary>
        </Suspense>
      )}
      {shareLinkOpen && (
        <Suspense>
          <ShareLinkModal open={shareLinkOpen} onClose={handleCloseShareLink} />
        </Suspense>
      )}
      {embedSnippetOpen && (
        <Suspense>
          <EmbedSnippetModal
            open={embedSnippetOpen}
            onClose={handleCloseEmbedSnippet}
          />
        </Suspense>
      )}
      {comparisonOpen && (
        <Suspense>
          <ComparisonModal
            open={comparisonOpen}
            onClose={handleCloseComparison}
          />
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
      <BoardManager
        toolbarPosition={toolbarPosition}
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
      <ToastContainer />
      <LiveRegion />
    </main>
  )
}

export default App
