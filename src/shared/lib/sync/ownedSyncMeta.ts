// src/shared/lib/sync/ownedSyncMeta.ts
// shared owner-scoped pending/synced timestamp helpers for sync sidecars

import { isNonEmptyString, isPositiveFiniteNumber } from '../typeGuards'

export interface OwnedSyncMeta
{
  pendingSyncAt: number | null
  lastSyncedAt: number | null
  ownerUserId: string
}

export const EMPTY_OWNED_SYNC_META: OwnedSyncMeta = {
  pendingSyncAt: null,
  lastSyncedAt: null,
  ownerUserId: '',
}

export const normalizeOwnedSyncMeta = (raw: unknown): OwnedSyncMeta =>
{
  if (!raw || typeof raw !== 'object')
  {
    return { ...EMPTY_OWNED_SYNC_META }
  }

  const candidate = raw as Partial<Record<keyof OwnedSyncMeta, unknown>>
  return {
    pendingSyncAt: isPositiveFiniteNumber(candidate.pendingSyncAt)
      ? candidate.pendingSyncAt
      : null,
    lastSyncedAt: isPositiveFiniteNumber(candidate.lastSyncedAt)
      ? candidate.lastSyncedAt
      : null,
    ownerUserId: isNonEmptyString(candidate.ownerUserId)
      ? candidate.ownerUserId
      : '',
  }
}

export const isOwnedSyncMetaEmpty = (meta: OwnedSyncMeta): boolean =>
  meta.pendingSyncAt === null && meta.lastSyncedAt === null

export const scopeOwnedSyncMeta = <T extends OwnedSyncMeta>(
  meta: T,
  emptyValue: () => T,
  ownerUserId: string
): T =>
{
  if (meta.ownerUserId !== ownerUserId)
  {
    return {
      ...emptyValue(),
      ownerUserId,
    }
  }

  return {
    ...meta,
    ownerUserId,
  }
}

export const stampOwnedSyncPending = <T extends OwnedSyncMeta>(
  meta: T,
  now: number
): T =>
{
  if (meta.pendingSyncAt !== null)
  {
    return meta
  }

  return {
    ...meta,
    pendingSyncAt: now,
  }
}

export const markOwnedSyncSynced = <T extends OwnedSyncMeta>(
  meta: T,
  ownerUserId: string,
  syncedAt: number
): T => ({
  ...meta,
  pendingSyncAt: null,
  lastSyncedAt: syncedAt,
  ownerUserId,
})

export const clearOwnedSyncPending = <T extends OwnedSyncMeta>(meta: T): T =>
{
  if (meta.pendingSyncAt === null)
  {
    return meta
  }

  return {
    ...meta,
    pendingSyncAt: null,
  }
}
