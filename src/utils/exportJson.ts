// src/utils/exportJson.ts
// JSON export & import utilities for board data

import { normalizeTierListData } from '../domain/boardData'
import type { TierListData } from '../types'
import { toFileBase } from './constants'
import { triggerDownload } from './exportImage'

interface TierListExport
{
  version: number
  exportedAt: string
  data: TierListData
}

// download the board state as a JSON file
export const exportBoardAsJson = (data: TierListData, title: string) =>
{
  const payload: TierListExport = {
    version: 3,
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
export const parseBoardJson = (text: string): TierListData =>
{
  let parsed: unknown
  try
  {
    parsed = JSON.parse(text)
  }
  catch
  {
    throw new Error('Invalid JSON file.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
  {
    throw new Error('Invalid tier list format.')
  }

  // accept both wrapped { version, data } format & raw TierListData
  const envelope = parsed as Record<string, unknown>
  const raw =
    typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data
      : parsed
  const data = raw as Partial<TierListData>

  if (!Array.isArray(data.tiers) || data.tiers.length === 0)
  {
    throw new Error('File must contain at least one tier.')
  }

  // validate tier structure
  for (const tier of data.tiers)
  {
    const hasLegacyColor =
      typeof (tier as { color?: unknown }).color === 'string'
    const hasCanonicalColorSpec =
      !!tier.colorSpec && typeof tier.colorSpec === 'object'

    if (
      !tier.id ||
      !tier.name ||
      (!hasLegacyColor && !hasCanonicalColorSpec) ||
      !Array.isArray(tier.itemIds)
    )
    {
      throw new Error(
        'Invalid tier structure — each tier needs id, name, color data, & itemIds.'
      )
    }
  }

  if (!data.items || typeof data.items !== 'object')
  {
    throw new Error('Missing items map.')
  }

  // validate all referenced item IDs exist in the items map
  const allReferencedIds = [
    ...data.tiers.flatMap((t) => t.itemIds),
    ...(Array.isArray(data.unrankedItemIds) ? data.unrankedItemIds : []),
  ]
  for (const id of allReferencedIds)
  {
    if (!(id in data.items))
    {
      throw new Error(`Referenced item "${id}" not found in items map.`)
    }
  }

  return normalizeTierListData(data, 'classic', 'Imported Tier List')
}

// detect single vs multi-board JSON & return validated board data for each
export const parseBoardsJson = (text: string): TierListData[] =>
{
  let parsed: unknown
  try
  {
    parsed = JSON.parse(text)
  }
  catch
  {
    throw new Error('Invalid JSON file.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
  {
    throw new Error('Invalid tier list format.')
  }

  const obj = parsed as Record<string, unknown>

  // multi-board envelope — has a boards array
  if (Array.isArray(obj.boards))
  {
    if (obj.boards.length === 0)
    {
      throw new Error('Export file contains no boards.')
    }

    const results: TierListData[] = []
    for (let i = 0; i < obj.boards.length; i++)
    {
      const entry = obj.boards[i] as Record<string, unknown>
      try
      {
        results.push(parseBoardJson(JSON.stringify(entry.data ?? entry)))
      }
      catch (err)
      {
        const label =
          typeof entry.title === 'string' ? entry.title : `#${i + 1}`
        throw new Error(
          `Board "${label}" is invalid: ${err instanceof Error ? err.message : 'unknown error'}`
        )
      }
    }
    return results
  }

  // single-board — delegate to existing parser
  return [parseBoardJson(text)]
}
