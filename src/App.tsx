// src/App.tsx
// * root application component — layout, export orchestration, & global error banner

import { useCallback, useEffect, useRef, useState } from 'react'

import { BoardActionBar } from './components/ui/BoardActionBar'
import { BoardManager } from './components/ui/BoardManager'
import { TierList } from './components/board/TierList'
import { TierSettings } from './components/settings/TierSettings'
import { Toolbar } from './components/ui/Toolbar'
import { useBoardTransition } from './hooks/useBoardTransition'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useBoardManagerStore } from './store/useBoardManagerStore'
import { useTierListStore } from './store/useTierListStore'
import { useSettingsStore } from './store/useSettingsStore'
import type { ImageFormat } from './types'
import {
  copyTierListToClipboard,
  exportTierListAsImage,
} from './utils/exportImage'
import { exportTierListAsPdf } from './utils/exportPdf'

function App()
{
  const title = useTierListStore((state) => state.title)
  const runtimeError = useTierListStore((state) => state.runtimeError)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)
  const addTier = useTierListStore((state) => state.addTier)
  const resetBoard = useTierListStore((state) => state.resetBoard)
  const isEmpty = useTierListStore(
    (state) => Object.keys(state.items).length === 0
  )

  // keep the board manager registry title in sync w/ the active board
  const syncTitle = useBoardManagerStore((state) => state.syncTitle)
  useEffect(() =>
  {
    syncTitle(title)
  }, [title, syncTitle])

  useUndoRedo()

  const { style: boardTransitionStyle, transitionTo } = useBoardTransition()

  const [settingsOpen, setSettingsOpen] = useState(false)
  // tracks active export type to disable the button & show loading state
  const [exportStatus, setExportStatus] = useState<
    ImageFormat | 'pdf' | 'clipboard' | null
  >(null)

  // ref attached to the export-capture wrapper div
  const exportRef = useRef<HTMLDivElement | null>(null)

  // trigger image or PDF export, guarding against concurrent calls
  const runExport = async (type: ImageFormat | 'pdf') =>
  {
    if (!exportRef.current || exportStatus)
    {
      return
    }

    clearRuntimeError()
    setExportStatus(type)

    try
    {
      const bgColor = useSettingsStore.getState().exportBackgroundColor
      if (type === 'pdf')
      {
        await exportTierListAsPdf(exportRef.current, title, bgColor)
      }
      else
      {
        await exportTierListAsImage(exportRef.current, title, type, bgColor)
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
    if (!exportRef.current || exportStatus)
    {
      return
    }

    clearRuntimeError()
    setExportStatus('clipboard')

    try
    {
      const bgColor = useSettingsStore.getState().exportBackgroundColor
      await copyTierListToClipboard(exportRef.current, bgColor)
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

  return (
    <main className="min-h-screen bg-[#232323] text-slate-100">
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
        <Toolbar />

        {/* inline error banner — shown for storage & export errors */}
        {runtimeError && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-rose-500/70 bg-rose-500/10 px-3 py-2">
            <p className="text-sm text-rose-100">{runtimeError}</p>
            <button
              type="button"
              className="rounded border border-rose-300/60 px-2 py-0.5 text-xs text-rose-100"
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
            onAddTier={addTier}
            onOpenSettings={() => setSettingsOpen(true)}
            onExport={runExport}
            onCopyToClipboard={runCopyToClipboard}
            onReset={resetBoard}
          />

          {/* empty board banner — shown when all items have been removed */}
          {isEmpty && (
            <div className="mx-auto my-4 max-w-md rounded-xl border border-[#444] bg-[#2b2b2b] p-6 text-center">
              <p className="mb-2 text-base font-semibold text-slate-100">
                Your tier list is empty
              </p>
              <p className="mb-4 text-sm text-[#888]">
                Open Settings to import images or add text items.
              </p>
              <button
                type="button"
                onClick={resetBoard}
                className="text-sm text-[#999] underline underline-offset-2 hover:text-slate-100"
              >
                Reset to load sample items
              </button>
            </div>
          )}

          <TierList exportRef={exportRef} />
        </div>
      </div>

      <TierSettings
        open={settingsOpen}
        onClose={useCallback(() => setSettingsOpen(false), [])}
      />
      <BoardManager onSwitchBoard={transitionTo} />
    </main>
  )
}

export default App
