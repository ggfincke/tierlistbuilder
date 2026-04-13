// src/features/workspace/boards/data/local/boardMigration.ts
// board-persistence migration helpers for legacy single-board storage

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import type { BoardId } from '@/shared/types/ids'
import {
  deleteBrowserStorageItem,
  readBrowserStorageItem,
} from '@/shared/lib/browserStorage'
import { generateBoardId } from '@/shared/lib/id'

// legacy single-board localStorage key used before multi-board sessions
export const APP_STORAGE_KEY = 'tier-list-builder-state'

// v1 tier IDs/colors used before the S–F → S–E rename in schema v2
const LEGACY_DEFAULT_TIER_SIGNATURE: Record<
  string,
  { name: string; color: string }
> = {
  'tier-s': { name: 'S', color: '#ff7f7f' },
  'tier-a': { name: 'A', color: '#ffbf7f' },
  'tier-b': { name: 'B', color: '#ffdf7f' },
  'tier-c': { name: 'C', color: '#ffff7f' },
  'tier-d': { name: 'D', color: '#7fff7f' },
  'tier-f': { name: 'F', color: '#7fbfff' },
}

interface LegacyDefaultTier
{
  id: string
  name: string
  color: string
  itemIds?: string[]
}

interface LegacyBoardState
{
  title?: string
  tiers?: LegacyDefaultTier[]
  unrankedItemIds?: string[]
  items?: BoardSnapshot['items']
  deletedItems?: BoardSnapshot['deletedItems']
}

interface LegacyBoardEnvelope
{
  state?: LegacyBoardState
  version?: number
}

interface LegacyBoardMigrationResult
{
  id: BoardId
  data: Record<string, unknown>
}

// check whether persisted tiers exactly match the v1 default signature
const isLegacyDefaultTierSet = (tiers: LegacyDefaultTier[]): boolean =>
{
  const legacyIds = Object.keys(LEGACY_DEFAULT_TIER_SIGNATURE)
  if (tiers.length !== legacyIds.length) return false
  if (tiers.some((tier) => tier.id === 'tier-e')) return false

  for (const tierId of legacyIds)
  {
    const expected = LEGACY_DEFAULT_TIER_SIGNATURE[tierId]
    const actual = tiers.find((tier) => tier.id === tierId)
    if (!actual) return false
    if (actual.name !== expected.name) return false
    if (actual.color.toLowerCase() !== expected.color) return false
  }

  return true
}

// rename tier-f → tier-e & update its label/color to the v2 defaults
const migrateLegacyDefaultTierSet = (
  tiers: LegacyDefaultTier[]
): LegacyDefaultTier[] =>
{
  if (!isLegacyDefaultTierSet(tiers))
  {
    return tiers
  }

  return tiers.map((tier) =>
    tier.id === 'tier-f'
      ? { ...tier, id: 'tier-e', name: 'E', color: '#74e56d' }
      : tier
  )
}

// attempt to migrate the legacy single-board localStorage key into the
// multi-board system
export const migrateLegacyBoard = (
  defaultTitle: string
): LegacyBoardMigrationResult | null =>
{
  try
  {
    const raw = readBrowserStorageItem(APP_STORAGE_KEY)
    if (!raw)
    {
      return null
    }

    const envelope = JSON.parse(raw) as LegacyBoardEnvelope
    const state = envelope?.state
    if (!state || !Array.isArray(state.tiers))
    {
      return null
    }

    const version = envelope.version ?? 1
    const tiers =
      version < 2
        ? migrateLegacyDefaultTierSet(state.tiers as LegacyDefaultTier[])
        : (state.tiers as LegacyDefaultTier[])

    const data: Record<string, unknown> = {
      title: state.title ?? defaultTitle,
      tiers,
      unrankedItemIds: state.unrankedItemIds ?? [],
      items: state.items ?? {},
      deletedItems: state.deletedItems ?? [],
    }

    const id = generateBoardId()

    // clean up the legacy single-board key after migration succeeds
    deleteBrowserStorageItem(APP_STORAGE_KEY)

    return { id, data }
  }
  catch
  {
    return null
  }
}
