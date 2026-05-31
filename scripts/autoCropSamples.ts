#!/usr/bin/env tsx
// scripts/autoCropSamples.ts
// bake crop transforms onto sample logo items via shared auto-crop math

import sharp from 'sharp'

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  bboxToItemTransform,
  pickAutoCropBBox,
  scanAutoCropPixels,
} from '@tierlistbuilder/contracts/workspace/imageMath'

import { runConvexSync } from './lib/convexExec.mjs'

interface Target
{
  itemId: string
  url: string
  mimeType: string
  aspectRatio: number | null
  boardAspectRatio: number
  rotation: 0 | 90 | 180 | 270
}

const ANALYSIS_MAX = 256
const APPLY_CHUNK = 80

const runConvex = (fn: string, args: string): string =>
  runConvexSync(['run', fn, args], {
    maxBuffer: 64 * 1024 * 1024,
  })

const main = async (): Promise<void> =>
{
  const targets: Target[] = JSON.parse(
    runConvex('dev/autoCrop:listAutoCropTargets', '{}')
  )
  console.log(`targets: ${targets.length}`)

  const updates: { itemId: string; transform: ItemTransform | null }[] = []
  let cropped = 0
  let failed = 0
  for (const [i, t] of targets.entries())
  {
    try
    {
      const res = await fetch(t.url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const { data, info } = await sharp(buf)
        .resize(ANALYSIS_MAX, ANALYSIS_MAX, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const scan = scanAutoCropPixels({
        data,
        width: info.width,
        height: info.height,
      })
      const bbox = scan ? pickAutoCropBBox(scan, true) : null
      const transform = bbox
        ? bboxToItemTransform(bbox, {
            imageAspectRatio: t.aspectRatio ?? undefined,
            boardAspectRatio: t.boardAspectRatio,
            rotation: t.rotation,
          })
        : null
      updates.push({ itemId: t.itemId, transform })
      if (transform) cropped += 1
    }
    catch (error)
    {
      failed += 1
      console.error(`skip ${t.itemId}:`, (error as Error).message)
    }
    if ((i + 1) % 50 === 0)
    {
      console.log(`  decoded ${i + 1}/${targets.length}`)
    }
  }

  console.log(`computed: ${cropped} cropped, ${failed} failed`)

  let patched = 0
  for (let i = 0; i < updates.length; i += APPLY_CHUNK)
  {
    const chunk = updates.slice(i, i + APPLY_CHUNK)
    const out = runConvex(
      'dev/autoCrop:applyItemTransforms',
      JSON.stringify({ items: chunk })
    )
    patched += (JSON.parse(out) as { patched: number }).patched
  }
  console.log(`patched: ${patched}`)
}

void main()
