// src/features/workspace/export/lib/exportJson.ts
// JSON export & import utilities for board data

import { normalizeBoardSnapshot } from '@/features/workspace/boards/model/boardSnapshot'
import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import { BOARD_DATA_VERSION } from '@/features/workspace/boards/data/local/boardStorage'
import { isRecord } from '@/shared/lib/typeGuards'
import { toFileBase } from '@/shared/lib/fileName'
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

  if (!isRecord(parsed))
  {
    throw new Error('Invalid tier list format.')
  }

  return parsed
}

// reject payloads whose envelope version is newer than the app supports;
// returns the schema version number for diagnostics
const assertSupportedVersion = (envelope: Record<string, unknown>): number =>
{
  if (typeof envelope.version !== 'number')
  {
    throw new Error(
      'Export file is missing a schema version. Re-export from a compatible version of the app.'
    )
  }

  if (envelope.version > BOARD_DATA_VERSION)
  {
    throw new Error(
      `File uses schema version ${envelope.version}, but this app only supports up to version ${BOARD_DATA_VERSION}. Update the app or re-export from a compatible version.`
    )
  }

  return envelope.version
}

// unwrap the `data` payload from a versioned envelope
const extractEnvelopeData = (
  envelope: Record<string, unknown>
): Record<string, unknown> =>
{
  if (!isRecord(envelope.data))
  {
    throw new Error('Export file is missing a "data" payload.')
  }

  return envelope.data
}

// download the board state as a JSON file
export const exportBoardAsJson = (data: BoardSnapshot, title: string) =>
{
  const payload: TierListExport = {
    version: BOARD_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${toFileBase(title)}.json`)
  URL.revokeObjectURL(url)
}

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

  if (!isRecord(tier.colorSpec))
  {
    return `Tier "${tier.name}" is missing a valid "colorSpec" object.`
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

// validate the inner board shape & return a normalized BoardSnapshot
const parseBoardData = (
  raw: Record<string, unknown>,
  fallbackTitle: string
): BoardSnapshot =>
{
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

  return normalizeBoardSnapshot(data, 'classic', fallbackTitle)
}

// parse & validate a versioned single-board export envelope
export const parseBoardJson = (text: string): BoardSnapshot =>
{
  const envelope = parseJsonObject(text)
  assertSupportedVersion(envelope)
  const raw = extractEnvelopeData(envelope)
  return parseBoardData(raw, 'Imported Tier List')
}

// parse & validate a versioned multi-board export envelope; single-board
// envelopes are auto-wrapped to a one-element array for call-site uniformity
export const parseBoardsJson = (text: string): BoardSnapshot[] =>
{
  const envelope = parseJsonObject(text)
  assertSupportedVersion(envelope)

  // multi-board envelope — has a boards array
  if (Array.isArray(envelope.boards))
  {
    const boards = envelope.boards

    if (boards.length === 0)
    {
      throw new Error('Export file contains no boards.')
    }

    const results: BoardSnapshot[] = []
    for (let i = 0; i < boards.length; i++)
    {
      const entry = boards[i] as unknown
      if (!isRecord(entry))
      {
        throw new Error(`Board #${i + 1} is not a valid object.`)
      }

      const innerData = isRecord(entry.data) ? entry.data : null
      if (!innerData)
      {
        throw new Error(`Board #${i + 1} is missing a "data" payload.`)
      }

      const label = typeof entry.title === 'string' ? entry.title : `#${i + 1}`
      try
      {
        results.push(parseBoardData(innerData, label))
      }
      catch (err)
      {
        throw new Error(
          `Board "${label}" is invalid: ${err instanceof Error ? err.message : 'unknown error'}`
        )
      }
    }
    return results
  }

  // single-board envelope — delegate to the single-envelope parser
  const raw = extractEnvelopeData(envelope)
  return [parseBoardData(raw, 'Imported Tier List')]
}
