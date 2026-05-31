// src/features/workspace/boards/ui/board-chrome/BoardActionBar.tsx
// floating action bar — composes board editing, export, save, & lock controls

import { BarChart3 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { ExportMenu } from '~/features/workspace/export/ui/ExportMenu'
import {
  getMenuPositionClasses,
  isVerticalPosition,
} from '~/shared/overlay/toolbarPosition'
import { ActionButton } from '~/shared/ui/ActionButton'
import type { BoardActionBarProps } from './BoardActionBar.types'
import { BoardLockToggle } from './BoardLockToggle'
import { SaveOrPublishMenu } from '../menus/SaveOrPublishMenu'
import { ToolbarCoreActions } from './ToolbarCoreActions'

// primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  toolbarPosition,
  onAddTier,
  onOpenSettings,
  onOpenStats,
  onShare,
  exportControls,
  publish,
  onReset,
}: BoardActionBarProps) =>
{
  const isVertical = isVerticalPosition(toolbarPosition)
  const menuPos = getMenuPositionClasses(toolbarPosition)
  const { reducedMotion, boardLocked, setBoardLocked } = usePreferencesStore(
    useShallow((state) => ({
      reducedMotion: state.reducedMotion,
      boardLocked: state.boardLocked,
      setBoardLocked: state.setBoardLocked,
    }))
  )

  return (
    <div
      className={`flex justify-center ${reducedMotion ? '' : 'transition-[padding,gap] duration-150 ease-out'}`}
    >
      <div
        className={`inline-flex items-center justify-center gap-3 rounded-[1.7rem] border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-sunken)] ${
          isVertical
            ? 'flex-col px-1.5 py-4 sm:px-2 sm:py-6'
            : 'flex-wrap px-4 py-1.5 sm:gap-5 sm:px-8 sm:py-2'
        }`}
      >
        <ToolbarCoreActions
          boardLocked={boardLocked}
          menuPos={menuPos}
          onAddTier={onAddTier}
          onOpenSettings={onOpenSettings}
          onReset={onReset}
        />

        <ExportMenu
          menuPos={menuPos}
          exportStatus={exportControls.status}
          exportingAll={exportControls.exportingAll}
          imageFormat={exportControls.imageFormat}
          onImageFormatChange={exportControls.onImageFormatChange}
          onExport={exportControls.onExport}
          onCopyToClipboard={exportControls.onCopyToClipboard}
          onExportAll={exportControls.onExportAll}
          onAnnotateExport={exportControls.onAnnotateExport}
          onPreviewExport={exportControls.onPreviewExport}
          onShare={onShare}
        />

        <ActionButton
          label="View statistics"
          title="View board statistics"
          onClick={onOpenStats}
        >
          <BarChart3 className="h-5 w-5" strokeWidth={1.8} />
        </ActionButton>

        <SaveOrPublishMenu menuPos={menuPos} publish={publish} />

        <BoardLockToggle
          boardLocked={boardLocked}
          onBoardLockedChange={setBoardLocked}
        />
      </div>
    </div>
  )
}
