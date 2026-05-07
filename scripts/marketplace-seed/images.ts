// scripts/marketplace-seed/images.ts
// image probing, resizing, & upload chunk preparation for template seeds

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  bucketValuesByAspectRatio,
  ratiosMatch,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import { mapAsyncLimit } from '../../src/shared/lib/asyncMapLimit'
import { probeImage, resolveSeedAutoCropTransform } from '../lib/autoCropDetect'
import {
  MAX_CHUNK_BASE64_BYTES,
  MIXED_TEMPLATE_ITEM_ASPECT_RATIO,
  SEED_ITEM_IO_CONCURRENCY,
  SEED_PREVIEW_MAX_SIZE,
  SEED_TILE_MAX_SIZE,
  SUPPORTED_EXTENSIONS,
} from './constants'
import { titleizeFromFilename } from './text'
import type { PreparedFolder, PreparedItem, ProbedItem } from './types'

export interface PayloadItem
{
  label: string
  tileBase64: string
  previewBase64: string
  aspectRatio: number
  transform: ItemTransform | null
}

export const probeFolder = async (
  folderPath: string,
  itemLabels: Record<string, string> | undefined
): Promise<ProbedItem[]> =>
{
  const entries = await readdir(folderPath, { withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) =>
    {
      const dot = name.lastIndexOf('.')
      if (dot === -1) return false
      return SUPPORTED_EXTENSIONS.has(name.slice(dot).toLowerCase())
    })
    .sort()

  return await mapAsyncLimit(files, SEED_ITEM_IO_CONCURRENCY, async (name) =>
  {
    const filePath = join(folderPath, name)
    const buffer = await readFile(filePath)
    const probe = await probeImage(new Uint8Array(buffer))
    return {
      label: itemLabels?.[name] ?? titleizeFromFilename(name),
      filePath,
      byteSize: buffer.byteLength,
      aspectRatio: probe.aspectRatio,
      bbox: probe.bbox,
    }
  })
}

const resolvePreparedTransform = (
  probe: ProbedItem,
  templateRatio: number
): ItemTransform | null =>
{
  if (ratiosMatch(probe.aspectRatio, templateRatio) || !probe.bbox)
  {
    return null
  }
  return resolveSeedAutoCropTransform({
    imageAspectRatio: probe.aspectRatio,
    bbox: probe.bbox,
    boardAspectRatio: templateRatio,
  })
}

export const prepareFolder = (probes: ProbedItem[]): PreparedFolder =>
{
  const ratioBuckets = bucketValuesByAspectRatio(
    probes,
    (probe) => probe.aspectRatio
  )
  const dominant = ratioBuckets[0]
  // Keep mostly-uniform poster folders on their dominant ratio.
  // A few MCU/TV outliers should crop, not force square fallback.
  // Change only w/ explicit seed-ratio clarification.
  const ratioSource =
    ratioBuckets.length <= 1
      ? 'consistent'
      : dominant && dominant.count > probes.length / 2
        ? 'mixed-dominant'
        : 'mixed-square'
  const templateRatio =
    ratioSource === 'mixed-square'
      ? MIXED_TEMPLATE_ITEM_ASPECT_RATIO
      : (dominant?.representative ?? MIXED_TEMPLATE_ITEM_ASPECT_RATIO)
  const shouldPrepareTransforms = ratioSource !== 'consistent'
  const items = probes.map((probe) => ({
    label: probe.label,
    filePath: probe.filePath,
    byteSize: probe.byteSize,
    aspectRatio: probe.aspectRatio,
    transform: shouldPrepareTransforms
      ? resolvePreparedTransform(probe, templateRatio)
      : null,
  }))
  return { templateRatio, ratioSource, items }
}

const estimateBase64Bytes = (byteSize: number): number =>
  Math.ceil(byteSize / 3) * 4

export const chunkItemsBySize = (items: PreparedItem[]): PreparedItem[][] =>
{
  const chunks: PreparedItem[][] = []
  let current: PreparedItem[] = []
  let currentSize = 0

  for (const item of items)
  {
    const itemSize = estimateBase64Bytes(item.byteSize)
    if (current.length > 0 && currentSize + itemSize > MAX_CHUNK_BASE64_BYTES)
    {
      chunks.push(current)
      current = []
      currentSize = 0
    }
    current.push(item)
    currentSize += itemSize
  }

  if (current.length > 0)
  {
    chunks.push(current)
  }
  return chunks
}

export const toPayloadItems = async (
  items: readonly PreparedItem[]
): Promise<PayloadItem[]> =>
  await mapAsyncLimit(items, SEED_ITEM_IO_CONCURRENCY, async (item) =>
  {
    const sourceBytes = await readFile(item.filePath)
    const pipeline = sharp(sourceBytes).rotate()
    const [tile, preview] = await Promise.all([
      pipeline
        .clone()
        .resize({
          width: SEED_TILE_MAX_SIZE,
          height: SEED_TILE_MAX_SIZE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer(),
      pipeline
        .clone()
        .resize({
          width: SEED_PREVIEW_MAX_SIZE,
          height: SEED_PREVIEW_MAX_SIZE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer(),
    ])
    return {
      label: item.label,
      tileBase64: tile.toString('base64'),
      previewBase64: preview.toString('base64'),
      aspectRatio: item.aspectRatio,
      transform: item.transform,
    }
  })
