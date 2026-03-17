// src/utils/exportJson.ts
// JSON export & import utilities for board data
import type { TierListData } from '../types'
import { toFileBase } from './constants'
import { triggerDownload } from './exportImage'

interface TierListExport {
  version: number
  exportedAt: string
  data: TierListData
}

// download the board state as a JSON file
export const exportBoardAsJson = (data: TierListData, title: string) => {
  const payload: TierListExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${toFileBase(title)}.json`)
  URL.revokeObjectURL(url)
}

// parse & validate a JSON string as board data, throwing descriptive errors on failure
export const parseBoardJson = (text: string): TierListData => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON file.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid tier list format.')
  }

  // accept both wrapped { version, data } format & raw TierListData
  const envelope = parsed as Record<string, unknown>
  const raw = (typeof envelope.data === 'object' && envelope.data !== null) ? envelope.data : parsed
  const data = raw as Partial<TierListData>

  if (!Array.isArray(data.tiers) || data.tiers.length === 0) {
    throw new Error('File must contain at least one tier.')
  }

  // validate tier structure
  for (const tier of data.tiers) {
    if (!tier.id || !tier.name || !tier.color || !Array.isArray(tier.itemIds)) {
      throw new Error('Invalid tier structure — each tier needs id, name, color, & itemIds.')
    }
  }

  if (!data.items || typeof data.items !== 'object') {
    throw new Error('Missing items map.')
  }

  // validate all referenced item IDs exist in the items map
  const allReferencedIds = [
    ...data.tiers.flatMap((t) => t.itemIds),
    ...(Array.isArray(data.unrankedItemIds) ? data.unrankedItemIds : []),
  ]
  for (const id of allReferencedIds) {
    if (!(id in data.items)) {
      throw new Error(`Referenced item "${id}" not found in items map.`)
    }
  }

  return {
    title: data.title ?? 'Imported Tier List',
    tiers: data.tiers,
    unrankedItemIds: Array.isArray(data.unrankedItemIds) ? data.unrankedItemIds : [],
    items: data.items,
    deletedItems: Array.isArray(data.deletedItems) ? data.deletedItems : [],
  }
}
