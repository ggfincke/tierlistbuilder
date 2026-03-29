// src/App.tsx
// * root application component — layout, export orchestration, & global error banner

import { useCallback, useState } from 'react'

import { BoardActionBar } from './components/ui/BoardActionBar'
import { BoardManager } from './components/ui/BoardManager'
import { ExportProgressOverlay } from './components/ui/ExportProgressOverlay'
import { TierList } from './components/board/TierList'
import { TierSettings } from './components/settings/TierSettings'
import { Toolbar } from './components/ui/Toolbar'
import { useBoardTransition } from './hooks/useBoardTransition'
import { useThemeApplicator } from './hooks/useThemeApplicator'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useTierListStore } from './store/useTierListStore'
import { useSettingsStore } from './store/useSettingsStore'
import { THEMES } from './theme/tokens'
import type { ImageFormat } from './types'
import {
  exportAllBoardsAsImages,
  exportAllBoardsAsJson,
  exportAllBoardsAsPdf,
} from './utils/exportAll'
import {
  copyBoardToClipboard,
  exportTierListAsImage,
} from './utils/exportImage'
import { getExportAppearance } from './utils/exportBoardRender'
import { exportTierListAsPdf } from './utils/exportPdf'
import { extractBoardData } from './store/useTierListStore'

// resolve the effective export background from the override or current theme
const getExportBg = () =>
{
  const { exportBackgroundOverride, themeId } = useSettingsStore.getState()
  return exportBackgroundOverride ?? THEMES[themeId]['export-bg']
}

// snapshot the current export-sensitive appearance settings
const getCurrentExportAppearance = () =>
  getExportAppearance(useSettingsStore.getState())

function App()
{
  const title = useTierListStore((state) => state.title)
  const runtimeError = useTierListStore((state) => state.runtimeError)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)
  const addTier = useTierListStore((state) => state.addTier)
  const resetBoard = useTierListStore((state) => state.resetBoard)

  useThemeApplicator()
  useUndoRedo()

  const { style: boardTransitionStyle, transitionTo } = useBoardTransition()

  const [settingsOpen, setSettingsOpen] = useState(false)
  // tracks active export type to disable the button & show loading state
  const [exportStatus, setExportStatus] = useState<
    ImageFormat | 'pdf' | 'clipboard' | null
  >(null)
  // tracks progress during multi-board "Export All" operations
  const [exportAllProgress, setExportAllProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  // trigger image or PDF export, guarding against concurrent calls
  const runExport = async (type: ImageFormat | 'pdf') =>
  {
    if (exportStatus)
    {
      return
    }

    clearRuntimeError()
    setExportStatus(type)

    try
    {
      const bgColor = getExportBg()
      const appearance = getCurrentExportAppearance()
      const data = extractBoardData(useTierListStore.getState())
      if (type === 'pdf')
      {
        await exportTierListAsPdf(data, title, appearance, bgColor)
      }
      else
      {
        await exportTierListAsImage(data, title, appearance, type, bgColor)
      }
    }
    catch
    {
      setRuntimeError('Export failed. Try again after images finish loading.')
    }
    finally
    {
      setExportStatus(null)
    }
  }

  // copy the rendered tier list image to the system clipboard
  const runCopyToClipboard = async () =>
  {
    if (exportStatus)
    {
      return
    }

    clearRuntimeError()
    setExportStatus('clipboard')

    try
    {
      const bgColor = getExportBg()
      const appearance = getCurrentExportAppearance()
      const data = extractBoardData(useTierListStore.getState())
      await copyBoardToClipboard(data, appearance, bgColor)
    }
    catch (err)
    {
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to copy to clipboard.'
      )
    }
    finally
    {
      setExportStatus(null)
    }
  }

  // export all boards as JSON, PDF, or images (ZIP)
  const runExportAll = async (type: 'json' | 'pdf' | ImageFormat) =>
  {
    if (exportStatus || exportAllProgress)
    {
      return
    }

    clearRuntimeError()

    // JSON export doesn't need DOM rendering
    if (type === 'json')
    {
      try
      {
        exportAllBoardsAsJson()
      }
      catch
      {
        setRuntimeError('Export All failed. Try again.')
      }
      return
    }

    const bgColor = getExportBg()
    const appearance = getCurrentExportAppearance()
    const onProgress = (current: number, total: number) =>
      setExportAllProgress({ current, total })

    setExportAllProgress({ current: 0, total: 1 })

    try
    {
      if (type === 'pdf')
      {
        await exportAllBoardsAsPdf(appearance, bgColor, onProgress)
      }
      else
      {
        await exportAllBoardsAsImages(appearance, type, bgColor, onProgress)
      }
    }
    catch
    {
      setRuntimeError(
        'Export All failed. Try again after images finish loading.'
      )
    }
    finally
    {
      setExportAllProgress(null)
    }
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
            onAddTier={addTier}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={runExport}
            onCopyToClipboard={runCopyToClipboard}
            onExportAll={runExportAll}
            onReset={resetBoard}
          />

          <TierList />
        </div>
      </div>

      <TierSettings
        open={settingsOpen}
        onClose={useCallback(() => setSettingsOpen(false), [])}
      />
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
