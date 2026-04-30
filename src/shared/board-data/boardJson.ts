// src/shared/board-data/boardJson.ts
// JSON parsing & validation for current board snapshot wire payloads

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import { BOARD_DATA_VERSION } from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import {
  itemUsesLocalImageRef,
  wireToSnapshot,
} from '~/shared/board-data/boardWireMapper'
import { formatError } from '~/shared/lib/errors'
import { isNonEmptyString, isRecord } from '~/shared/lib/typeGuards'

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

const assertSupportedVersion = (envelope: Record<string, unknown>): void =>
{
  if (typeof envelope.version !== 'number')
  {
    throw new Error(
      'Export file is missing a schema version. Re-export from the current app.'
    )
  }

  if (envelope.version > BOARD_DATA_VERSION)
  {
    throw new Error(
      `File uses schema version ${envelope.version}, but this app only supports up to version ${BOARD_DATA_VERSION}. Update the app or re-export from the current app.`
    )
  }
}

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

  if (itemUsesLocalImageRef(item))
  {
    return `Item "${id}" uses a local imageRef without inline imageUrl bytes. Re-export the board as JSON from a build that embeds images.`
  }

  if (!hasImageUrl && !hasImageRef && !hasLabel && !hasBgColor)
  {
    return `Item "${id}" has no image, label, or backgroundColor — it would be invisible.`
  }

  return null
}

const parseBoardData = async (
  raw: Record<string, unknown>,
  fallbackTitle: string
): Promise<BoardSnapshot> =>
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
    await wireToSnapshot(data, fallbackTitle),
    'classic',
    fallbackTitle
  )
}

export const parseBoardJson = async (text: string): Promise<BoardSnapshot> =>
{
  const envelope = parseJsonObject(text)
  assertSupportedVersion(envelope)
  return parseBoardData(extractEnvelopeData(envelope), 'Imported Tier List')
}

export const parseBoardSnapshotJson = (
  text: string,
  fallbackTitle = 'Imported Tier List'
): Promise<BoardSnapshot> =>
  parseBoardData(parseJsonObject(text), fallbackTitle)

export const parseBoardsJson = async (
  text: string
): Promise<BoardSnapshot[]> =>
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
        results.push(await parseBoardData(innerData, label))
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

  return [
    await parseBoardData(extractEnvelopeData(envelope), 'Imported Tier List'),
  ]
}
