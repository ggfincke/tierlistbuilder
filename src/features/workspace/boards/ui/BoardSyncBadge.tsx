// src/features/workspace/boards/ui/BoardSyncBadge.tsx
// inline sync-status badge for per-board lists (BoardManager). renders nothing when idle;
// surfaces a small icon for every other state. shares the taxonomy w/ SyncStatusIndicator

import {
  AlertCircle,
  CloudOff,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  useBoardSyncStatus,
  type EffectiveBoardSyncStatus,
} from '~/features/platform/sync/status/useBoardSyncStatus'

interface BadgeVisual
{
  Icon: LucideIcon
  description: string
  colorClass: string
  spin?: boolean
}

const BADGE_VISUALS: Record<
  Exclude<EffectiveBoardSyncStatus, 'idle'>,
  BadgeVisual
> = {
  syncing: {
    Icon: RefreshCw,
    description: 'Saving…',
    colorClass: 'text-[var(--t-text-secondary)]',
    spin: true,
  },
  error: {
    Icon: TriangleAlert,
    description: 'Sync failed — retrying',
    colorClass: 'text-[var(--t-destructive-hover)]',
  },
  conflict: {
    Icon: AlertCircle,
    description: 'Conflicting edits — resolve in the dialog',
    colorClass: 'text-[var(--t-destructive-hover)]',
  },
  offline: {
    Icon: CloudOff,
    description: 'Offline — will sync when connection returns',
    colorClass: 'text-[var(--t-text-faint)]',
  },
}

interface BoardSyncBadgeProps
{
  boardId: BoardId
  // shown alongside the icon's description in the title tooltip so the
  // user sees which board the status refers to when this is one of many
  boardTitle: string
}

export const BoardSyncBadge = ({
  boardId,
  boardTitle,
}: BoardSyncBadgeProps) =>
{
  const status = useBoardSyncStatus(boardId)

  if (status === 'idle')
  {
    return null
  }

  const { Icon, description, colorClass, spin } = BADGE_VISUALS[status]
  const tooltip = `${boardTitle}: ${description}`

  return (
    <span
      role="status"
      aria-live="polite"
      title={tooltip}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${colorClass}`}
    >
      <Icon
        className={`h-3 w-3 ${spin ? 'animate-spin' : ''}`}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="sr-only">{tooltip}</span>
    </span>
  )
}
