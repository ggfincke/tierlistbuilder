// src/components/ui/BoardActionBar.tsx
// floating action bar — undo/redo, add tier, settings, export, & reset controls

import { useState } from 'react'
import {
  Plus,
  Redo2,
  RotateCcw,
  Settings as SettingsIcon,
  Undo2,
} from 'lucide-react'

import type { ImageFormat } from '../../types'
import { useTierListStore } from '../../store/useTierListStore'
import { ActionButton } from './ActionButton'
import { ConfirmDialog } from './ConfirmDialog'
import { ExportMenu } from './ExportMenu'

interface BoardActionBarProps
{
  // active export type while an export is in progress (null when idle)
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  // true while an "Export All" operation is running
  exportingAll: boolean
  onAddTier: () => void
  onOpenSettings: () => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onReset: () => void
}

// * primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  exportStatus,
  exportingAll,
  onAddTier,
  onOpenSettings,
  onExport,
  onCopyToClipboard,
  onExportAll,
  onReset,
}: BoardActionBarProps) =>
{
  const pastLength = useTierListStore((state) => state.past.length)
  const futureLength = useTierListStore((state) => state.future.length)
  const undo = useTierListStore((state) => state.undo)
  const redo = useTierListStore((state) => state.redo)
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <>
      <div className="mt-3 flex justify-center">
        <div className="inline-flex items-center gap-5 rounded-[1.7rem] border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-sunken)] px-8 py-2">
          {/* undo & redo controls */}
          <ActionButton
            label="Undo"
            title="Undo"
            onClick={undo}
            disabled={pastLength === 0}
          >
            <Undo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Redo"
            title="Redo"
            onClick={redo}
            disabled={futureLength === 0}
          >
            <Redo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* add a new tier row to the bottom of the board */}
          <ActionButton label="Add tier" title="Add Tier" onClick={onAddTier}>
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* open the settings panel for image import & tier management */}
          <ActionButton
            label="Open settings"
            title="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* export button w/ dropdown menu */}
          <ExportMenu
            exportStatus={exportStatus}
            exportingAll={exportingAll}
            onExport={onExport}
            onCopyToClipboard={onCopyToClipboard}
            onExportAll={onExportAll}
          />

          {/* reset — requires confirmation before reloading sample items */}
          <ActionButton
            label="Reset board"
            title="Reset"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>
        </div>
      </div>

      {/* confirmation dialog shown before the destructive reset action */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset board?"
        description="This restores the default tiers and moves all items back to the unranked pool."
        confirmText="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() =>
        {
          onReset()
          setConfirmReset(false)
        }}
      />
    </>
  )
}
