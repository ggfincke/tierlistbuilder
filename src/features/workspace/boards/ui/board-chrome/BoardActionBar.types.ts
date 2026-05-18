// src/features/workspace/boards/ui/board-chrome/BoardActionBar.types.ts
// shared prop contracts for board action bar subcomponents

import type { ToolbarPosition } from '@tierlistbuilder/contracts/platform/preferences'
import type { ImageFormat } from '~/features/workspace/export/model/runtime'
import type { ExportStatus } from '~/features/workspace/export/model/useExportController'
import type { MenuPositionClasses } from '~/shared/overlay/toolbarPosition'

export type BoardActionBarMenuPosition = MenuPositionClasses

export interface BoardActionBarProps
{
  toolbarPosition: ToolbarPosition
  onAddTier: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
  onShare: () => void
  exportControls: BoardActionBarExportControls
  onReset: () => void
}

interface BoardActionBarExportControls
{
  status: ExportStatus
  exportingAll: boolean
  imageFormat: ImageFormat
  onImageFormatChange: (format: ImageFormat) => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onAnnotateExport: () => void
  onPreviewExport: () => void
}
