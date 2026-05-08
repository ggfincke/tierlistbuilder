// src/features/marketplace/model/coverAutoCrop.ts
// cover-side auto-fit pipeline. one decode of the master image yields a
// content bbox; project that bbox into per-surface CoverFrames at locked aspects

import {
  pickAutoCropBBox,
  type AutoCropBBox,
  type AutoCropScan,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import {
  COVER_SURFACES,
  SURFACE_ASPECT_RATIOS,
  type CoverFrame,
  type CoverSurface,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'

import { scanBlobForAutoCrop } from '~/shared/lib/autoCrop'
import { logger } from '~/shared/lib/logger'

// breathing room around the detected content, as a fraction of source-image
// extents on each side. mirrors the workspace auto-crop default so cover
// framings sit consistently w/ board-item auto-crop output
const COVER_PADDING_FRACTION = 0.02

interface ScanCoverInput
{
  // either the freshly picked file or a URL to an existing master image
  source: { kind: 'file'; file: File } | { kind: 'existing'; url: string }
  trimSoftShadows: boolean
}

// in-memory cache keyed by a stable identity (file fingerprint or URL).
// dedupes re-scans across "Auto-fit" clicks within the same editor session
const scanCache = new Map<string, AutoCropScan | null>()

const cacheKey = (source: ScanCoverInput['source']): string =>
{
  if (source.kind === 'file')
  {
    return `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`
  }
  return `url:${source.url}`
}

const getBlob = async (
  source: ScanCoverInput['source']
): Promise<Blob | null> =>
{
  if (source.kind === 'file') return source.file
  try
  {
    const response = await fetch(source.url)
    if (!response.ok) return null
    return await response.blob()
  }
  catch (error)
  {
    logger.warn('marketplace', 'cover image fetch failed', error)
    return null
  }
}

export const scanCoverImage = async ({
  source,
  trimSoftShadows,
}: ScanCoverInput): Promise<AutoCropBBox | null> =>
{
  const key = cacheKey(source)
  if (!scanCache.has(key))
  {
    const blob = await getBlob(source)
    if (!blob)
    {
      scanCache.set(key, null)
    }
    else
    {
      try
      {
        scanCache.set(key, await scanBlobForAutoCrop(blob))
      }
      catch (error)
      {
        logger.warn('marketplace', 'cover image scan failed', error)
        scanCache.set(key, null)
      }
    }
  }
  const scan = scanCache.get(key) ?? null
  return scan ? pickAutoCropBBox(scan, trimSoftShadows) : null
}

interface BBoxToCoverFrameInput
{
  bbox: AutoCropBBox
  surfaceAspect: number
  sourceWidth: number
  sourceHeight: number
  paddingFraction?: number
}

// expand the bbox to the surface's locked aspect (grow short axis), center on
// bbox center. frame may sit outside [0, 1] -> letterboxed at render time
// (matte from coverFramingPlacement). caller decides any further clamping
export const bboxToCoverFrame = ({
  bbox,
  surfaceAspect,
  sourceWidth,
  sourceHeight,
  paddingFraction = COVER_PADDING_FRACTION,
}: BBoxToCoverFrameInput): CoverFrame =>
{
  const padded = padBBox(bbox, paddingFraction)
  const bboxWNorm = padded.right - padded.left
  const bboxHNorm = padded.bottom - padded.top
  const bboxWPx = bboxWNorm * sourceWidth
  const bboxHPx = bboxHNorm * sourceHeight
  const bboxAspect = bboxWPx / bboxHPx

  let frameWPx: number
  let frameHPx: number
  if (surfaceAspect >= bboxAspect)
  {
    // surface is wider than bbox — keep bbox height, grow width
    frameHPx = bboxHPx
    frameWPx = surfaceAspect * frameHPx
  }
  else
  {
    // surface is narrower than bbox — keep bbox width, grow height
    frameWPx = bboxWPx
    frameHPx = frameWPx / surfaceAspect
  }

  const frameW = frameWPx / sourceWidth
  const frameH = frameHPx / sourceHeight
  const bcx = (padded.left + padded.right) / 2
  const bcy = (padded.top + padded.bottom) / 2
  return {
    x: bcx - frameW / 2,
    y: bcy - frameH / 2,
    width: frameW,
    height: frameH,
  }
}

interface BBoxToCoverFramingInput
{
  bbox: AutoCropBBox
  sourceWidth: number
  sourceHeight: number
  paddingFraction?: number
}

export const bboxToCoverFraming = ({
  bbox,
  sourceWidth,
  sourceHeight,
  paddingFraction,
}: BBoxToCoverFramingInput): TemplateCoverFraming =>
{
  const out = {} as Record<CoverSurface, CoverFrame>
  for (const surface of COVER_SURFACES)
  {
    out[surface] = bboxToCoverFrame({
      bbox,
      surfaceAspect: SURFACE_ASPECT_RATIOS[surface],
      sourceWidth,
      sourceHeight,
      paddingFraction,
    })
  }
  return out
}

const padBBox = (bbox: AutoCropBBox, padding: number): AutoCropBBox => ({
  left: bbox.left - padding,
  top: bbox.top - padding,
  right: bbox.right + padding,
  bottom: bbox.bottom + padding,
})
