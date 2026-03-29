// src/App.tsx
// * root application component — shell composition, modal state, & global error banner

import { useCallback, useMemo, useState } from 'react'

import { BoardActionBar } from './components/ui/BoardActionBar'
import { BoardManager } from './components/ui/BoardManager'
import { ExportProgressOverlay } from './components/ui/ExportProgressOverlay'
import { TierList } from './components/board/TierList'
import { TierSettings } from './components/settings/TierSettings'
import { Toolbar } from './components/ui/Toolbar'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useBoardTransition } from './hooks/useBoardTransition'
import { useCurrentPaletteId } from './hooks/useCurrentPaletteId'
import { useExportController } from './hooks/useExportController'
import { useThemeApplicator } from './hooks/useThemeApplicator'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useTierListStore } from './store/useTierListStore'

function App()
{
  const appReady = useAppBootstrap()
  const paletteId = useCurrentPaletteId()
  const runtimeError = useTierListStore((state) => state.runtimeError)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const addTier = useTierListStore((state) => state.addTier)
  const resetBoard = useTierListStore((state) => state.resetBoard)

  useThemeApplicator()
  useUndoRedo()

  const { style: boardTransitionStyle, transitionTo } = useBoardTransition()
  const {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
  } = useExportController()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const handleAddTier = useMemo(
    () => () => addTier(paletteId),
    [addTier, paletteId]
  )
  const handleResetBoard = useMemo(
    () => () => resetBoard(paletteId),
    [paletteId, resetBoard]
  )
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [])

  if (!appReady)
  {
    return (
      <main className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]" />
    )
  }

  return (
    <main className="min-h-screen bg-[var(--t-bg-page)] text-[var(--t-text)]">
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
          <BoardActionBar
            exportStatus={exportStatus}
            exportingAll={exportAllProgress !== null}
            onAddTier={handleAddTier}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={runExport}
            onCopyToClipboard={runCopyToClipboard}
            onExportAll={runExportAll}
            onReset={handleResetBoard}
          />

          <TierList />
        </div>
      </div>

      <TierSettings open={settingsOpen} onClose={handleCloseSettings} />
      <BoardManager onSwitchBoard={transitionTo} />
      {exportAllProgress && (
        <ExportProgressOverlay
          current={exportAllProgress.current}
          total={exportAllProgress.total}
        />
      )}
    </main>
  )
}

export default App
