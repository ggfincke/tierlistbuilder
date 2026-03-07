// src/App.tsx
// * root application component — layout, export orchestration, & global error banner
import { useRef, useState } from 'react'

import { BoardActionBar } from './components/ui/BoardActionBar'
import { TierList } from './components/board/TierList'
import { TierSettings } from './components/settings/TierSettings'
import { Toolbar } from './components/ui/Toolbar'
import { useTierListStore } from './store/useTierListStore'
import { exportTierListAsPng } from './utils/exportImage'
import { exportTierListAsPdf } from './utils/exportPdf'

function App() {
  const title = useTierListStore((state) => state.title)
  const runtimeError = useTierListStore((state) => state.runtimeError)
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)
  const addTier = useTierListStore((state) => state.addTier)
  const resetBoard = useTierListStore((state) => state.resetBoard)

  const [settingsOpen, setSettingsOpen] = useState(false)
  // tracks active export type to disable the button & show loading state
  const [exportStatus, setExportStatus] = useState<'png' | 'pdf' | null>(null)

  // ref attached to the export-capture wrapper div
  const exportRef = useRef<HTMLDivElement | null>(null)

  // trigger PNG or PDF export, guarding against concurrent calls
  const runExport = async (type: 'png' | 'pdf') => {
    if (!exportRef.current || exportStatus) {
      return
    }

    clearRuntimeError()
    setExportStatus(type)

    try {
      if (type === 'png') {
        await exportTierListAsPng(exportRef.current, title)
      } else {
        await exportTierListAsPdf(exportRef.current, title)
      }
    } catch {
      setRuntimeError('Export failed. Try again after images finish loading.')
    } finally {
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

        <BoardActionBar
          exportStatus={exportStatus}
          onAddTier={addTier}
          onOpenSettings={() => setSettingsOpen(true)}
          onExport={runExport}
          onReset={resetBoard}
        />
        <TierList exportRef={exportRef} />
      </div>

      <TierSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  )
}

export default App
