// src/features/platform/sync/status/syncStatusVisuals.ts
// shared icon + copy + color taxonomy for sync status; consumed by
// BoardSyncBadge (short copy) & SyncStatusIndicator (long copy)

import {
  AlertCircle,
  CloudCheck,
  CloudOff,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

import type { EffectiveBoardSyncStatus } from './syncStatusStore'

export type SyncStatusCopyVariant = 'short' | 'long'

export interface SyncStatusVisual
{
  Icon: LucideIcon
  colorClass: string
  description: string
  spin?: boolean
}

interface SyncStatusVisualSpec
{
  Icon: LucideIcon
  colorClass: string
  spin?: boolean
  shortDescription: string
  longDescription: string
}

const SPECS: Record<EffectiveBoardSyncStatus, SyncStatusVisualSpec> = {
  idle: {
    Icon: CloudCheck,
    colorClass: 'text-[var(--t-text-faint)]',
    shortDescription: 'All changes saved',
    longDescription: 'All changes saved to the cloud',
  },
  syncing: {
    Icon: RefreshCw,
    colorClass: 'text-[var(--t-text-secondary)]',
    spin: true,
    shortDescription: 'Saving…',
    longDescription: 'Saving changes to the cloud…',
  },
  error: {
    Icon: TriangleAlert,
    colorClass: 'text-[var(--t-destructive-hover)]',
    shortDescription: 'Sync failed — retrying',
    longDescription: 'Sync failed — retrying automatically',
  },
  conflict: {
    Icon: AlertCircle,
    colorClass: 'text-[var(--t-destructive-hover)]',
    shortDescription: 'Conflicting edits — resolve in the dialog',
    longDescription: 'Conflicting edits — resolve in the dialog to continue',
  },
  offline: {
    Icon: CloudOff,
    colorClass: 'text-[var(--t-text-faint)]',
    shortDescription: 'Offline — will sync when connection returns',
    longDescription: 'Offline — changes will sync when the connection returns',
  },
}

export const getSyncStatusVisual = (
  status: EffectiveBoardSyncStatus,
  variant: SyncStatusCopyVariant
): SyncStatusVisual =>
{
  const spec = SPECS[status]
  return {
    Icon: spec.Icon,
    colorClass: spec.colorClass,
    spin: spec.spin,
    description:
      variant === 'short' ? spec.shortDescription : spec.longDescription,
  }
}
