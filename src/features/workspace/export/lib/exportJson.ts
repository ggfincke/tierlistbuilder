// src/features/workspace/export/lib/exportJson.ts
// JSON export & import utilities for board data

import { normalizeBoardSnapshot } from '~/features/workspace/boards/model/boardSnapshot'
import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import { BOARD_DATA_VERSION } from '~/features/workspace/boards/data/local/boardStorage'
import { formatError } from '~/shared/lib/errors'
import { isNonEmptyString, isRecord } from '~/shared/lib/typeGuards'
import { toFileBase } from '~/shared/lib/fileName'
import { triggerDownload } from './exportImage'
import { snapshotToWire, wireToSnapshot } from './boardWireMapper'

interface TierListExport
{
  version: number
  exportedAt: string
  data: BoardSnapshotWire
}

// parse a JSON string & validate it is a plain object
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

// reject envelopes newer than the app supports
const assertSupportedVersion = (envelope: Record<string, unknown>): void =>
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

// download board state as self-contained JSON
export const exportBoardAsJson = async (
  data: BoardSnapshot,
  title: string
): Promise<void> =>
{
  const wire = await snapshotToWire(data)
  const payload: TierListExport = {
    version: BOARD_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data: wire,
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

// validate a single item entry has the minimum fields needed to render
const validateItemEntry = (id: string, item: unknown): string | null =>
{
  if (!isRecord(item))
  {
    return `Item "${id}" is not a valid object.`
  }

  const hasImageUrl = isNonEmptyString(item.imageUrl)
  const hasImageRef =
    isRecord(item.imageRef) && isNonEmptyString(item.imageRef.hash)
  const hasLabel = isNonEmptyString(item.label)
  const hasBgColor = isNonEmptyString(item.backgroundColor)

  if (hasImageRef && !hasImageUrl)
  {
    return `Item "${id}" uses a local imageRef without inline imageUrl bytes. Re-export the board as JSON from a build that embeds images.`
  }

  if (!hasImageUrl && !hasLabel && !hasBgColor)
  {
    return `Item "${id}" has no image, label, or backgroundColor — it would be invisible.`
  }

  return null
}

// validate board shape & normalize into an in-memory snapshot
const parseBoardData = (
  raw: Record<string, unknown>,
  fallbackTitle: string
): BoardSnapshot =>
{
  const data = raw as Partial<BoardSnapshotWire>

  if (!Array.isArray(data.tiers) || data.tiers.length === 0)
  {
    throw new Error('File must contain at least one tier.')
  }

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

  for (const [id, item] of Object.entries(data.items))
  {
    const itemError = validateItemEntry(id, item)
    if (itemError)
    {
      throw new Error(itemError)
    }
  }

  const allReferencedIds = [
    ...data.tiers.flatMap((tier) => tier.itemIds),
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

  for (const id of allReferencedIds)
  {
    if (!(id in data.items))
    {
      throw new Error(`Referenced item "${id}" not found in items map.`)
    }
  }

  return normalizeBoardSnapshot(
    wireToSnapshot(data, fallbackTitle),
    'classic',
    fallbackTitle
  )
}

// parse & validate a versioned single-board export envelope
export const parseBoardJson = (text: string): BoardSnapshot =>
{
  const envelope = parseJsonObject(text)
  assertSupportedVersion(envelope)
  return parseBoardData(extractEnvelopeData(envelope), 'Imported Tier List')
}

// parse & validate a raw board snapshot JSON payload
export const parseBoardSnapshotJson = (
  text: string,
  fallbackTitle = 'Imported Tier List'
): BoardSnapshot => parseBoardData(parseJsonObject(text), fallbackTitle)

// parse & validate a versioned multi-board export envelope
export const parseBoardsJson = (text: string): BoardSnapshot[] =>
{
  const envelope = parseJsonObject(text)
  assertSupportedVersion(envelope)

  if (Array.isArray(envelope.boards))
  {
    if (envelope.boards.length === 0)
    {
      throw new Error('Export file contains no boards.')
    }

    const results: BoardSnapshot[] = []

    for (let i = 0; i < envelope.boards.length; i++)
    {
      const entry = envelope.boards[i] as unknown
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
      catch (error)
      {
        throw new Error(
          `Board "${label}" is invalid: ${formatError(error, 'unknown error')}`
        )
      }
    }

    return results
  }

  return [parseBoardData(extractEnvelopeData(envelope), 'Imported Tier List')]
}
