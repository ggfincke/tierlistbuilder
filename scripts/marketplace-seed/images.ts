// scripts/marketplace-seed/images.ts
// image probing, resizing, & upload chunk preparation for template seeds

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp, { type ResizeOptions } from 'sharp'

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  COVER_SURFACES,
  SURFACE_ASPECT_RATIOS,
  type CoverFrame,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  bucketValuesByAspectRatio,
  ratiosMatch,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import { mapAsyncLimit } from '../../src/shared/lib/asyncMapLimit'
import { probeImage, resolveSeedAutoCropTransform } from '../lib/autoCropDetect'
import {
  MAX_CONVEX_STRING_BASE64_BYTES,
  MAX_CHUNK_BASE64_BYTES,
  MIXED_TEMPLATE_ITEM_ASPECT_RATIO,
  SEED_COVER_PREVIEW_WIDTH,
  SEED_COVER_TILE_WIDTH,
  SEED_ITEM_IO_CONCURRENCY,
  SEED_PREVIEW_MAX_SIZE,
  SEED_TILE_MAX_SIZE,
  SUPPORTED_EXTENSIONS,
} from './constants'
import { titleizeFromFilename } from './text'
import type { PreparedFolder, PreparedItem, ProbedItem } from './types'

interface PayloadItem
{
  label: string
  tileBase64: string
  previewBase64: string
  aspectRatio: number
  transform: ItemTransform | null
}

interface PayloadCoverImage
{
  tileBase64: string
  previewBase64: string
  sourceWidth: number
  sourceHeight: number
}

const JPEG_MIN_QUALITY = 62
const JPEG_QUALITY_STEP = 4
const JPEG_RESIZE_SCALE = 0.85
const JPEG_MIN_WIDTH = 320

interface BoundedJpegBase64Options
{
  resize: ResizeOptions & { width: number }
  quality: number
  flattenBackground?: { r: number; g: number; b: number }
}

const assertSeedBase64FitsConvex = (base64: string, label: string): void =>
{
  if (base64.length <= MAX_CONVEX_STRING_BASE64_BYTES) return
  throw new Error(
    `${label} base64 payload is ${base64.length} bytes; limit is ${MAX_CONVEX_STRING_BASE64_BYTES}`
  )
}

const toBoundedJpegBase64 = async (
  source: sharp.Sharp,
  { resize, quality, flattenBackground }: BoundedJpegBase64Options
): Promise<string> =>
{
  let width = resize.width
  let height =
    typeof resize.height === 'number' && resize.height > 0
      ? resize.height
      : undefined

  while (width >= JPEG_MIN_WIDTH)
  {
    for (
      let nextQuality = quality;
      nextQuality >= JPEG_MIN_QUALITY;
      nextQuality -= JPEG_QUALITY_STEP
    )
    {
      const pipeline = source.clone().resize({ ...resize, width, height })
      if (flattenBackground)
      {
        pipeline.flatten({ background: flattenBackground })
      }
      const base64 = (
        await pipeline.jpeg({ quality: nextQuality, mozjpeg: true }).toBuffer()
      ).toString('base64')
      if (base64.length <= MAX_CONVEX_STRING_BASE64_BYTES)
      {
        return base64
      }
    }

    width = Math.floor(width * JPEG_RESIZE_SCALE)
    height = height ? Math.floor(height * JPEG_RESIZE_SCALE) : undefined
  }

  throw new Error(
    `could not fit jpeg seed payload under ${MAX_CONVEX_STRING_BASE64_BYTES} bytes`
  )
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
    const [tile, previewBase64] = await Promise.all([
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
      toBoundedJpegBase64(pipeline, {
        resize: {
          width: SEED_PREVIEW_MAX_SIZE,
          height: SEED_PREVIEW_MAX_SIZE,
          fit: 'inside',
          withoutEnlargement: true,
        },
        flattenBackground: { r: 255, g: 255, b: 255 },
        quality: 85,
      }),
    ])
    const tileBase64 = tile.toString('base64')
    assertSeedBase64FitsConvex(tileBase64, `${item.filePath} tile`)
    return {
      label: item.label,
      tileBase64,
      previewBase64,
      aspectRatio: item.aspectRatio,
      transform: item.transform,
    }
  })

export const toPayloadCoverImage = async (
  filePath: string
): Promise<PayloadCoverImage> =>
{
  const sourceBytes = await readFile(filePath)
  const pipeline = sharp(sourceBytes).rotate()
  const [{ width, height }, tile, previewBase64] = await Promise.all([
    pipeline.clone().metadata(),
    pipeline
      .clone()
      .resize({
        width: SEED_COVER_TILE_WIDTH,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
    toBoundedJpegBase64(pipeline, {
      resize: {
        width: SEED_COVER_PREVIEW_WIDTH,
        withoutEnlargement: true,
      },
      quality: 86,
    }),
  ])
  const tileBase64 = tile.toString('base64')
  assertSeedBase64FitsConvex(tileBase64, `${filePath} cover tile`)
  if (!width || !height)
  {
    throw new Error(`could not read cover dimensions for ${filePath}`)
  }
  return {
    tileBase64,
    previewBase64,
    sourceWidth: width,
    sourceHeight: height,
  }
}

// per-surface CoverFrame = centered surface-aspect crop inside [0, 1] scaled
// by `zoom`. z=1 -> cover (no matte); z>1 grows past [0, 1] -> matte letterbox
const zoomedFrameForSurface = (
  sourceWidth: number,
  sourceHeight: number,
  surfaceAspect: number,
  zoom: number
): CoverFrame =>
{
  const sourceAspect = sourceWidth / sourceHeight
  let baseW: number
  let baseH: number
  if (surfaceAspect >= sourceAspect)
  {
    baseW = 1
    baseH = sourceAspect / surfaceAspect
  }
  else
  {
    baseW = surfaceAspect / sourceAspect
    baseH = 1
  }
  const w = baseW * zoom
  const h = baseH * zoom
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h }
}

// produces a TemplateCoverFraming that scales the source's cover-fit rect by
// `zoom` for every surface. zoom=1 is a no-op vs. cover; values > 1 dial in
// progressively more letterbox until full contain is reached
export const computeZoomedCoverFraming = (
  sourceWidth: number,
  sourceHeight: number,
  zoom: number
): TemplateCoverFraming =>
{
  const out = {} as Record<(typeof COVER_SURFACES)[number], CoverFrame>
  for (const surface of COVER_SURFACES)
  {
    out[surface] = zoomedFrameForSurface(
      sourceWidth,
      sourceHeight,
      SURFACE_ASPECT_RATIOS[surface],
      zoom
    )
  }
  return out
}
