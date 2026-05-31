// src/features/library/lib/statusMeta.ts
// presentation taxonomy for the My Boards two-axis status model

import {
  AlertCircle,
  CloudCheck,
  CloudOff,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type {
  LibraryBoardFilter,
  SyncState,
} from '@tierlistbuilder/contracts/workspace/board'
import { PUBLISH_STATE_META } from '~/shared/board-ui/publishStateMeta'

interface SyncMeta
{
  label: string
  Icon: LucideIcon
  // neutral for the resting states (Local only/Synced); info while a clone is
  // in flight; warn for failed/conflict which need user attention
  tone: 'neutral' | 'info' | 'warn'
  spin?: boolean
}

export const LIBRARY_SYNC_META: Record<SyncState, SyncMeta> = {
  localOnly: { label: 'Local only', Icon: CloudOff, tone: 'neutral' },
  synced: { label: 'Synced', Icon: CloudCheck, tone: 'neutral' },
  pending: { label: 'Syncing', Icon: RefreshCw, tone: 'info', spin: true },
  failed: { label: 'Sync failed', Icon: TriangleAlert, tone: 'warn' },
  conflict: { label: 'Conflict', Icon: AlertCircle, tone: 'warn' },
}

// filter-chip label for the "filtered by X" result-count copy. 'all' has no
// label since it isn't a narrowing filter
export const getLibraryFilterStatusLabel = (
  filter: LibraryBoardFilter
): string | null => (filter === 'all' ? null : PUBLISH_STATE_META[filter].label)
