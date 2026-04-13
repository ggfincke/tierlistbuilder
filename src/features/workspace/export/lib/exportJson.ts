// src/features/workspace/export/lib/exportJson.ts
// JSON export & import utilities for board data

import { normalizeBoardSnapshot } from '@/features/workspace/boards/model/boardSnapshot'
import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import { BOARD_DATA_VERSION } from '@/features/workspace/boards/data/local/boardStorage'
import { toFileBase } from './constants'
import { triggerDownload } from './exportImage'

interface TierListExport
{
  version: number
  exportedAt: string
  data: BoardSnapshot
}

// parse a JSON string & validate it is a plain object (not null, not an array)
const parseJsonObject = (text: string): Record<string, unknown> =>
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

  return parsed as Record<string, unknown>
}

// download the board state as a JSON file
export const exportBoardAsJson = (data: BoardSnapshot, title: string) =>
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

// narrow an unknown JSON value to a plain object record
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

// validate a single tier entry & return a descriptive error if invalid
const validateTierEntry = (tier: unknown, index: number): string | null =>
{
  if (!isRecord(tier))
  {
    return `Tier #${index + 1} is not a valid object.`
  }

  if (!tier.id || typeof tier.id !== 'string')
  {
    return `Tier #${index + 1} is missing a valid "id" (expected string).`
  }

  if (!tier.name || typeof tier.name !== 'string')
  {
    return `Tier "${tier.id}" is missing a valid "name" (expected string).`
  }

  const hasLegacyColor = typeof tier.color === 'string'
  const hasCanonicalColorSpec =
    !!tier.colorSpec && typeof tier.colorSpec === 'object'

  if (!hasLegacyColor && !hasCanonicalColorSpec)
  {
    return `Tier "${tier.name}" is missing color data (expected "colorSpec" object or legacy "color" string).`
  }

  if (!Array.isArray(tier.itemIds))
  {
    return `Tier "${tier.name}" is missing "itemIds" array.`
  }

  return null
}

// validate a single item entry has the minimum required fields
const validateItemEntry = (id: string, item: unknown): string | null =>
{
  if (!isRecord(item))
  {
    return `Item "${id}" is not a valid object.`
  }

  const hasImage = typeof item.imageUrl === 'string' && item.imageUrl.length > 0
  const hasLabel = typeof item.label === 'string' && item.label.length > 0
  const hasBgColor =
    typeof item.backgroundColor === 'string' && item.backgroundColor.length > 0

  if (!hasImage && !hasLabel && !hasBgColor)
  {
    return `Item "${id}" has no imageUrl, label, or backgroundColor — it would be invisible.`
  }

  return null
}

// parse & validate a JSON string as board data, throwing descriptive errors on failure
export const parseBoardJson = (text: string): BoardSnapshot =>
{
  const envelope = parseJsonObject(text)

  // warn if the file is from a newer schema version
  if (
    typeof envelope.version === 'number' &&
    envelope.version > BOARD_DATA_VERSION
  )
  {
    throw new Error(
      `File uses schema version ${envelope.version}, but this app only supports up to version ${BOARD_DATA_VERSION}. Update the app or re-export from a compatible version.`
    )
  }

  // accept both wrapped { version, data } format & raw BoardSnapshot
  const raw =
    typeof envelope.data === 'object' && envelope.data !== null
      ? envelope.data
      : envelope
  const data = raw as Partial<BoardSnapshot>

  if (!Array.isArray(data.tiers) || data.tiers.length === 0)
  {
    throw new Error('File must contain at least one tier.')
  }

  // validate tier structure w/ per-field diagnostics
  for (let i = 0; i < data.tiers.length; i++)
  {
    const tierError = validateTierEntry(data.tiers[i], i)
    if (tierError)
    {
      throw new Error(tierError)
    }
  }

  if (!data.items || typeof data.items !== 'object')
  {
    throw new Error('Missing items map — the file has no item data.')
  }

  // validate individual item entries
  for (const [id, item] of Object.entries(data.items))
  {
    const itemError = validateItemEntry(id, item)
    if (itemError)
    {
      throw new Error(itemError)
    }
  }

  // detect duplicate item references across tiers
  const allReferencedIds = [
    ...data.tiers.flatMap((t) => t.itemIds),
    ...(Array.isArray(data.unrankedItemIds) ? data.unrankedItemIds : []),
  ]
  const seen = new Set<string>()
  for (const id of allReferencedIds)
  {
    if (seen.has(id))
    {
      throw new Error(
        `Item "${id}" is referenced in multiple tiers — each item can only appear once.`
      )
    }
    seen.add(id)
  }

  // validate all referenced item IDs exist in the items map
  for (const id of allReferencedIds)
  {
    if (!(id in data.items))
    {
      throw new Error(`Referenced item "${id}" not found in items map.`)
    }
  }

  return normalizeBoardSnapshot(data, 'classic', 'Imported Tier List')
}

// detect single vs multi-board JSON & return validated board data for each
export const parseBoardsJson = (text: string): BoardSnapshot[] =>
{
  const obj = parseJsonObject(text)

  // multi-board envelope — has a boards array
  if (Array.isArray(obj.boards))
  {
    if (obj.boards.length === 0)
    {
      throw new Error('Export file contains no boards.')
    }

    const results: BoardSnapshot[] = []
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
