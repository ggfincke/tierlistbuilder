// src/features/workspace/boards/ui/SyncStatusIndicator.tsx
// active-board cloud sync status indicator. renders only when cloud sync is
// active for the session, then reads useBoardSyncStatus for the active board.
// passive — the scheduler retries errors automatically (exponential backoff)
// & conflicts auto-open the resolver modal. fully-derived chrome; no actions

import {
  AlertCircle,
  CloudCheck,
  CloudOff,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  useBoardSyncStatus,
  type EffectiveBoardSyncStatus,
} from '~/features/platform/sync/useBoardSyncStatus'

interface SyncStatusIndicatorProps
{
  active: boolean
}

interface StatusVisual
{
  Icon: LucideIcon
  // text shown in the title tooltip & as the screen-reader label
  description: string
  // tailwind text-color class — cued by severity
  colorClass: string
  // when true, spin the icon (only meaningful for syncing)
  spin?: boolean
}

const STATUS_VISUALS: Record<EffectiveBoardSyncStatus, StatusVisual> = {
  idle: {
    Icon: CloudCheck,
    description: 'All changes saved to the cloud',
    colorClass: 'text-[var(--t-text-faint)]',
  },
  syncing: {
    Icon: RefreshCw,
    description: 'Saving changes to the cloud…',
    colorClass: 'text-[var(--t-text-secondary)]',
    spin: true,
  },
  error: {
    Icon: TriangleAlert,
    description: 'Sync failed — retrying automatically',
    colorClass: 'text-[var(--t-destructive-hover)]',
  },
  conflict: {
    Icon: AlertCircle,
    description: 'Conflicting edits — resolve in the dialog to continue',
    colorClass: 'text-[var(--t-destructive-hover)]',
  },
  offline: {
    Icon: CloudOff,
    description: 'Offline — changes will sync when the connection returns',
    colorClass: 'text-[var(--t-text-faint)]',
  },
}

export const SyncStatusIndicator = ({ active }: SyncStatusIndicatorProps) =>
{
  const activeBoardId = useWorkspaceBoardRegistryStore(
    (state) => state.activeBoardId
  )
  const boardId = active && activeBoardId !== '' ? activeBoardId : null
  const status = useBoardSyncStatus(boardId)

  if (boardId === null)
  {
    return null
  }

  const visual = STATUS_VISUALS[status]
  const { Icon, description, colorClass, spin } = visual

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      title={description}
      // sized w/ a square footprint matching ActionButton's height so the
      // bar height stays consistent, but no border/background — the visual
      // weight is intentionally lighter to signal "status, not action"
      className={`flex h-10 w-10 shrink-0 items-center justify-center max-sm:h-11 max-sm:w-11 ${colorClass}`}
    >
      <Icon
        className={`h-5 w-5 ${spin ? 'animate-spin' : ''}`}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span className="sr-only">{description}</span>
    </div>
  )
}
