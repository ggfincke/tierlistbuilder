// src/shared/board-data/boardJson.ts
// JSON parsing & validation for current board snapshot wire payloads

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  MAX_BOARD_ITEM_ALT_TEXT_LEN,
  MAX_BOARD_ITEM_BACKGROUND_COLOR_LEN,
  MAX_BOARD_ITEM_LABEL_LEN,
  MAX_BOARD_ITEM_NOTES_LEN,
  MAX_BOARD_TITLE_LENGTH,
  MAX_TIER_DESCRIPTION_LEN,
  MAX_TIER_NAME_LEN,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  BOARD_DATA_VERSION,
  MAX_BOARD_IMPORT_BOARDS,
  MAX_BOARD_IMPORT_JSON_BYTES,
} from '@tierlistbuilder/contracts/workspace/boardEnvelope'
import {
  MAX_CLOUD_BOARD_TIERS,
  MAX_LARGE_CLOUD_BOARD_ITEMS,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { MAX_IMAGE_BYTE_SIZE } from '@tierlistbuilder/contracts/platform/media'
import { MAX_TEMPLATE_TITLE_LENGTH } from '@tierlistbuilder/contracts/marketplace/template'
import { MAX_RANKING_TITLE_LENGTH } from '@tierlistbuilder/contracts/marketplace/ranking'
import { HEX_COLOR_PATTERN } from '@tierlistbuilder/contracts/lib/hexColor'
import { MAX_EXTERNAL_ID_LENGTH } from '@tierlistbuilder/contracts/lib/ids'
import { normalizeBoardSnapshot } from '~/shared/board-data/boardSnapshot'
import {
  itemUsesLocalImageRef,
  wireToSnapshot,
} from '~/shared/board-data/boardWireMapper'
import { formatError } from '~/shared/lib/errors'
import { isNonEmptyString, isRecord } from '~/shared/lib/typeGuards'

const MAX_BOARD_IMPORT_INLINE_IMAGE_URL_LENGTH =
  Math.ceil((MAX_IMAGE_BYTE_SIZE * 4) / 3) + 128
const MAX_BOARD_IMPORT_ITEM_REFERENCES = MAX_LARGE_CLOUD_BOARD_ITEMS
const MAX_BOARD_IMPORT_URL_LENGTH = 2048

interface BoardImportFileLike
{
  size: number
  text: () => Promise<string>
}

const formatMiB = (bytes: number): string =>
  `${Math.round(bytes / 1024 / 1024)}MB`

const assertCountAtMost = (label: string, count: number, max: number): void =>
{
  if (count > max)
  {
    throw new Error(`${label} exceeds import limit of ${max}.`)
  }
}

const assertStringLengthAtMost = (
  label: string,
  value: unknown,
  max: number
): void =>
{
  if (typeof value === 'string' && value.length > max)
  {
    throw new Error(`${label} exceeds import limit of ${max} characters.`)
  }
}

// mirror the cloud upsert's color validation so a hand-edited JSON can't seed
// invalid CSS into local storage; empty/absent values are skipped (optional)
const assertHexColor = (label: string, value: unknown): void =>
{
  if (typeof value !== 'string' || value.length === 0) return
  if (!HEX_COLOR_PATTERN.test(value))
  {
    throw new Error(`${label} must be a #rrggbb hex color.`)
  }
}

export const readBoardImportJsonFile = async (
  file: BoardImportFileLike
): Promise<string> =>
{
  if (file.size > MAX_BOARD_IMPORT_JSON_BYTES)
  {
    throw new Error(
      `JSON import file is too large: ${formatMiB(file.size)} exceeds ${formatMiB(MAX_BOARD_IMPORT_JSON_BYTES)}.`
    )
  }

  return file.text()
}

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

const validateTierEntry = (tier: unknown, index: number): void =>
{
  if (!isRecord(tier))
  {
    throw new Error(`Tier #${index + 1} is not a valid object.`)
  }

  if (!tier.id || typeof tier.id !== 'string')
  {
    throw new Error(
      `Tier #${index + 1} is missing a valid "id" (expected string).`
    )
  }
  assertStringLengthAtMost(
    `Tier #${index + 1} id`,
    tier.id,
    MAX_EXTERNAL_ID_LENGTH
  )

  if (!tier.name || typeof tier.name !== 'string')
  {
    throw new Error(
      `Tier "${tier.id}" is missing a valid "name" (expected string).`
    )
  }
  assertStringLengthAtMost(
    `Tier "${tier.id}" name`,
    tier.name,
    MAX_TIER_NAME_LEN
  )
  assertStringLengthAtMost(
    `Tier "${tier.id}" description`,
    tier.description,
    MAX_TIER_DESCRIPTION_LEN
  )

  if (!isRecord(tier.colorSpec))
  {
    throw new Error(
      `Tier "${tier.name}" is missing a valid "colorSpec" object.`
    )
  }
  if (tier.colorSpec.kind === 'custom')
  {
    assertHexColor(`Tier "${tier.name}" colorSpec.hex`, tier.colorSpec.hex)
  }
  if (isRecord(tier.rowColorSpec) && tier.rowColorSpec.kind === 'custom')
  {
    assertHexColor(
      `Tier "${tier.name}" rowColorSpec.hex`,
      tier.rowColorSpec.hex
    )
  }

  if (!Array.isArray(tier.itemIds))
  {
    throw new Error(`Tier "${tier.name}" is missing "itemIds" array.`)
  }
  assertCountAtMost(
    `Tier "${tier.name}" item references`,
    tier.itemIds.length,
    MAX_BOARD_IMPORT_ITEM_REFERENCES
  )
}

interface ValidateItemEntryOptions
{
  requireVisible?: boolean
}

const validateItemEntry = (
  id: string,
  item: unknown,
  options: ValidateItemEntryOptions = {}
): string | null =>
{
  if (!isRecord(item))
  {
    return `Item "${id}" is not a valid object.`
  }
  const requireVisible = options.requireVisible ?? true
  assertStringLengthAtMost(
    `Item "${id}" id`,
    id,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    `Item "${id}" wire id`,
    item.id,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    `Item "${id}" label`,
    item.label,
    MAX_BOARD_ITEM_LABEL_LEN
  )
  assertStringLengthAtMost(
    `Item "${id}" altText`,
    item.altText,
    MAX_BOARD_ITEM_ALT_TEXT_LEN
  )
  assertStringLengthAtMost(
    `Item "${id}" notes`,
    item.notes,
    MAX_BOARD_ITEM_NOTES_LEN
  )
  assertStringLengthAtMost(
    `Item "${id}" backgroundColor`,
    item.backgroundColor,
    MAX_BOARD_ITEM_BACKGROUND_COLOR_LEN
  )
  assertHexColor(`Item "${id}" backgroundColor`, item.backgroundColor)
  assertStringLengthAtMost(
    `Item "${id}" sourceTemplateItemExternalId`,
    item.sourceTemplateItemExternalId,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    `Item "${id}" imageUrl`,
    item.imageUrl,
    MAX_BOARD_IMPORT_INLINE_IMAGE_URL_LENGTH
  )

  const isHashedRef = (value: unknown): boolean =>
    isRecord(value) && isNonEmptyString(value.hash)

  const hasImageUrl = isNonEmptyString(item.imageUrl)
  const hasImageRef =
    isHashedRef(item.imageRef) ||
    isHashedRef(item.tileImageRef) ||
    isHashedRef(item.sourceImageRef)
  const hasLabel = isNonEmptyString(item.label)
  const hasBgColor = isNonEmptyString(item.backgroundColor)

  if (itemUsesLocalImageRef(item))
  {
    return `Item "${id}" uses a local image ref without inline imageUrl bytes. Re-export the board as JSON from a build that embeds images.`
  }

  if (
    requireVisible &&
    !hasImageUrl &&
    !hasImageRef &&
    !hasLabel &&
    !hasBgColor
  )
  {
    return `Item "${id}" has no image, label, or backgroundColor — it would be invisible.`
  }

  return null
}

const validateBoardMetadata = (data: Record<string, unknown>): void =>
{
  assertStringLengthAtMost('Board title', data.title, MAX_BOARD_TITLE_LENGTH)
  assertStringLengthAtMost(
    'sourceTemplateId',
    data.sourceTemplateId,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    'sourceRankingId',
    data.sourceRankingId,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    'sourceTemplateTitle',
    data.sourceTemplateTitle,
    MAX_TEMPLATE_TITLE_LENGTH
  )
  assertStringLengthAtMost(
    'sourceRankingTitle',
    data.sourceRankingTitle,
    MAX_RANKING_TITLE_LENGTH
  )
  assertStringLengthAtMost(
    'preferredCriterionExternalId',
    data.preferredCriterionExternalId,
    MAX_EXTERNAL_ID_LENGTH
  )

  if (!isRecord(data.sourceTemplateCoverMedia)) return

  assertStringLengthAtMost(
    'sourceTemplateCoverMedia.externalId',
    data.sourceTemplateCoverMedia.externalId,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    'sourceTemplateCoverMedia.contentHash',
    data.sourceTemplateCoverMedia.contentHash,
    MAX_EXTERNAL_ID_LENGTH
  )
  assertStringLengthAtMost(
    'sourceTemplateCoverMedia.url',
    data.sourceTemplateCoverMedia.url,
    MAX_BOARD_IMPORT_URL_LENGTH
  )
  assertStringLengthAtMost(
    'sourceTemplateCoverMedia.mimeType',
    data.sourceTemplateCoverMedia.mimeType,
    MAX_EXTERNAL_ID_LENGTH
  )
}

const parseBoardData = async (
  raw: Record<string, unknown>,
  fallbackTitle: string
): Promise<BoardSnapshot> =>
{
  const data = raw as Partial<BoardSnapshotWire>
  validateBoardMetadata(raw)

  if (!Array.isArray(data.tiers) || data.tiers.length === 0)
  {
    throw new Error('File must contain at least one tier.')
  }
  assertCountAtMost('Tier count', data.tiers.length, MAX_CLOUD_BOARD_TIERS)

  for (let i = 0; i < data.tiers.length; i++)
  {
    validateTierEntry(data.tiers[i], i)
  }

  if (!isRecord(data.items))
  {
    throw new Error('Missing items map — the file has no item data.')
  }

  const itemMap = data.items
  const itemEntries = Object.entries(itemMap)
  assertCountAtMost(
    'Item count',
    itemEntries.length,
    MAX_LARGE_CLOUD_BOARD_ITEMS
  )

  for (const [id, item] of itemEntries)
  {
    const itemError = validateItemEntry(id, item)
    if (itemError)
    {
      throw new Error(itemError)
    }
  }

  const deletedItems = Array.isArray(data.deletedItems) ? data.deletedItems : []
  assertCountAtMost(
    'Deleted item count',
    deletedItems.length,
    MAX_LARGE_CLOUD_BOARD_ITEMS
  )
  for (let i = 0; i < deletedItems.length; i++)
  {
    const item = deletedItems[i]
    const id =
      isRecord(item) && typeof item.id === 'string' ? item.id : `#${i + 1}`
    const itemError = validateItemEntry(id, item, { requireVisible: false })
    if (itemError)
    {
      throw new Error(itemError)
    }
  }

  const seen = new Set<string>()
  let referencedItemCount = 0

  const checkReferencedId = (id: unknown): void =>
  {
    referencedItemCount += 1
    assertCountAtMost(
      'Referenced item count',
      referencedItemCount,
      MAX_BOARD_IMPORT_ITEM_REFERENCES
    )

    if (typeof id !== 'string')
    {
      throw new Error('Item references must be strings.')
    }
    assertStringLengthAtMost(
      `Referenced item "${id}"`,
      id,
      MAX_EXTERNAL_ID_LENGTH
    )

    if (seen.has(id))
    {
      throw new Error(
        `Item "${id}" is referenced in multiple tiers — each item can only appear once.`
      )
    }

    seen.add(id)

    if (!(id in itemMap))
    {
      throw new Error(`Referenced item "${id}" not found in items map.`)
    }
  }

  for (const tier of data.tiers)
  {
    if (!isRecord(tier) || !Array.isArray(tier.itemIds)) continue
    for (const id of tier.itemIds)
    {
      checkReferencedId(id)
    }
  }

  if (Array.isArray(data.unrankedItemIds))
  {
    assertCountAtMost(
      'Unranked item reference count',
      data.unrankedItemIds.length,
      MAX_BOARD_IMPORT_ITEM_REFERENCES
    )
    for (const id of data.unrankedItemIds)
    {
      checkReferencedId(id)
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
    assertCountAtMost(
      'Board count',
      envelope.boards.length,
      MAX_BOARD_IMPORT_BOARDS
    )

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

      assertStringLengthAtMost(
        `Board #${i + 1} title`,
        entry.title,
        MAX_BOARD_TITLE_LENGTH
      )
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
