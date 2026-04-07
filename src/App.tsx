// src/App.tsx
// * root application component — shell composition, modal state, & global error banner

import { useCallback, useMemo, useState, type MouseEvent } from 'react'

import { AnnotationEditor } from './components/annotation/AnnotationEditor'
import { ComparisonModal } from './components/comparison/ComparisonModal'
import { EmbedView } from './components/embed/EmbedView'
import { BoardActionBar } from './components/ui/BoardActionBar'
import { BoardManager } from './components/ui/BoardManager'
import { EmbedSnippetModal } from './components/ui/EmbedSnippetModal'
import { ExportProgressOverlay } from './components/ui/ExportProgressOverlay'
import { LiveRegion } from './components/ui/LiveRegion'
import { ShareLinkModal } from './components/ui/ShareLinkModal'
import { ShortcutsPanel } from './components/ui/ShortcutsPanel'
import { StatsModal } from './components/stats/StatsModal'
import { TierList } from './components/board/TierList'
import { TierSettings } from './components/settings/TierSettings'
import { Toolbar } from './components/ui/Toolbar'
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
                onReset={handleResetBoard}
              />
            }
            toolbarPosition={toolbarPosition}
          />
        </div>
      </div>

      <TierSettings open={settingsOpen} onClose={handleCloseSettings} />
      <StatsModal open={statsOpen} onClose={handleCloseStats} />
      <ShareLinkModal open={shareLinkOpen} onClose={handleCloseShareLink} />
      <EmbedSnippetModal
        open={embedSnippetOpen}
        onClose={handleCloseEmbedSnippet}
      />
      <ComparisonModal open={comparisonOpen} onClose={handleCloseComparison} />
      <AnnotationEditor
        open={annotationImage !== null}
        onClose={handleCloseAnnotation}
        backgroundImage={annotationImage}
      />
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
      <LiveRegion />
    </main>
  )
}

export default App
