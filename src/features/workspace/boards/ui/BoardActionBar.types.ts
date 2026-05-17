// src/features/workspace/boards/ui/BoardActionBar.types.ts
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
  publish?: BoardActionBarPublishControls
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

export interface BoardActionBarPublishControls
{
  ranking?: () => void
  template?: () => void
  // signed-out: publish actions still appear but route to a sign-in prompt
  // instead of being hidden, so the capability stays discoverable
  signInRequired?: boolean
}
