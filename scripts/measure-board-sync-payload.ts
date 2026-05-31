#!/usr/bin/env tsx
// scripts/measure-board-sync-payload.ts
// estimates cloud sync JSON payload sizes for standard & large boards.

import { gzipSync } from 'node:zlib'
import {
  LABEL_FONT_SIZE_PX_DEFAULT,
  type BoardSnapshot,
  type TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import {
  MAX_LARGE_CLOUD_BOARD_ITEMS,
  MAX_STANDARD_CLOUD_BOARD_ITEMS,
} from '@tierlistbuilder/contracts/workspace/cloudBoard'
import { asItemId, asTierId } from '@tierlistbuilder/contracts/lib/ids'
import type { TierPaletteColorSpec } from '@tierlistbuilder/contracts/lib/theme'

import { snapshotToCloudPayload } from '../src/features/workspace/boards/data/cloud/boardMapper'
import type { BoardImageUploadResult } from '../src/features/platform/media/imageUploader'

import { formatBytes } from './lib/formatBytes.mjs'

const TIER_COUNT = 10

const createPaletteTierColorSpec = (index: number): TierPaletteColorSpec => ({
  kind: 'palette',
  index,
})

interface Scenario
{
  name: string
  itemCount: number
  richItems: boolean
  moveFirstItem?: boolean
}

interface PayloadMeasurement
{
  name: string
  itemCount: number
  payloadItems: number
  jsonBytes: number
  gzipBytes: number
  mapMs: number
}

const scenarios: readonly Scenario[] = [
  {
    name: 'standard-200-text',
    itemCount: MAX_STANDARD_CLOUD_BOARD_ITEMS,
    richItems: false,
  },
  {
    name: 'large-2000-text',
    itemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
    richItems: false,
  },
  {
    name: 'large-2000-rich',
    itemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
    richItems: true,
  },
  {
    name: 'large-2000-rich-one-item-move',
    itemCount: MAX_LARGE_CLOUD_BOARD_ITEMS,
    richItems: true,
    moveFirstItem: true,
  },
]

const buildItem = (index: number, richItems: boolean): TierItem =>
{
  const id = asItemId(`item-${index}`)
  if (!richItems)
  {
    return { id, label: `Item ${index}` }
  }

  const rotation = ([0, 90, 180, 270] as const)[index % 4]
  return {
    id,
    imageRef: {
      hash: `hash-${index}`,
      cloudMediaExternalId: `media-${index}`,
    },
    sourceImageRef: {
      hash: `editor-hash-${index}`,
      cloudMediaExternalId: `media-${index}`,
    },
    label: `Example item ${index}`,
    backgroundColor: index % 2 === 0 ? '#111827' : '#f9fafb',
    altText: `Synthetic image ${index}`,
    aspectRatio: index % 3 === 0 ? 16 / 9 : 1,
    imageFit: index % 2 === 0 ? 'cover' : 'contain',
    transform: {
      rotation,
      zoom: 1 + (index % 5) * 0.1,
      offsetX: ((index % 7) - 3) / 100,
      offsetY: ((index % 11) - 5) / 100,
    },
    labelOptions: {
      visible: true,
      placement: { mode: 'captionBelow' },
      fontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
      textStyleId: 'rounded',
    },
  }
}

const buildUploadResult = ({
  itemCount,
  richItems,
}: Scenario): BoardImageUploadResult =>
{
  const mediaExternalIdByHash = new Map<string, string>()
  const mediaExternalIdByItemId = new Map<string, string>()
  if (!richItems)
  {
    return { mediaExternalIdByHash, mediaExternalIdByItemId }
  }

  for (let index = 0; index < itemCount; index++)
  {
    const mediaExternalId = `media-${index}`
    mediaExternalIdByHash.set(`hash-${index}`, mediaExternalId)
    mediaExternalIdByHash.set(`editor-hash-${index}`, mediaExternalId)
    mediaExternalIdByItemId.set(`item-${index}`, mediaExternalId)
  }

  return { mediaExternalIdByHash, mediaExternalIdByItemId }
}

const buildSnapshot = ({
  itemCount,
  richItems,
  moveFirstItem,
}: Scenario): BoardSnapshot =>
{
  const tiers = Array.from({ length: TIER_COUNT }, (_, index) => ({
    id: asTierId(`tier-${index}`),
    name: `Tier ${index + 1}`,
    colorSpec: createPaletteTierColorSpec(index),
    itemIds: [] as ReturnType<typeof asItemId>[],
  }))
  const items: BoardSnapshot['items'] = {}

  for (let index = 0; index < itemCount; index++)
  {
    const item = buildItem(index, richItems)
    items[item.id] = item
    tiers[index % TIER_COUNT].itemIds.push(item.id)
  }

  if (moveFirstItem)
  {
    const itemId = asItemId('item-0')
    tiers[0].itemIds = tiers[0].itemIds.filter((id) => id !== itemId)
    tiers[1].itemIds = [itemId, ...tiers[1].itemIds]
  }

  return {
    title: richItems ? 'Synthetic large media board' : 'Synthetic text board',
    tiers,
    unrankedItemIds: [],
    items,
    deletedItems: [],
    itemAspectRatio: 1,
    itemAspectRatioMode: 'manual',
    aspectRatioPromptDismissed: true,
    defaultItemImageFit: richItems ? 'cover' : undefined,
    paletteId: 'classic',
    textStyleId: 'rounded',
    labels: richItems
      ? {
          show: true,
          placement: { mode: 'captionBelow' },
          fontSizePx: LABEL_FONT_SIZE_PX_DEFAULT,
        }
      : undefined,
  }
}

const measureScenario = (scenario: Scenario): PayloadMeasurement =>
{
  const snapshot = buildSnapshot(scenario)
  const uploadResult = buildUploadResult(scenario)
  const start = performance.now()
  const payload = snapshotToCloudPayload(snapshot, uploadResult)
  const mapMs = performance.now() - start
  const json = JSON.stringify(payload)

  return {
    name: scenario.name,
    itemCount: scenario.itemCount,
    payloadItems: payload.items.length,
    jsonBytes: Buffer.byteLength(json),
    gzipBytes: gzipSync(json).byteLength,
    mapMs,
  }
}

const measurements = scenarios.map(measureScenario)

console.log('Cloud sync payload measurement')
console.log(`Generated at: ${new Date().toISOString()}`)
console.log('')
console.log(
  ['scenario', 'items', 'payload items', 'json', 'gzip', 'mapper ms'].join('\t')
)

for (const measurement of measurements)
{
  console.log(
    [
      measurement.name,
      String(measurement.itemCount),
      String(measurement.payloadItems),
      formatBytes(measurement.jsonBytes, { unit: 'mb' }),
      formatBytes(measurement.gzipBytes, { unit: 'mb' }),
      measurement.mapMs.toFixed(2),
    ].join('\t')
  )
}
