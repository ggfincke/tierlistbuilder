// scripts/marketplace-seed/templateSeeder.ts
// folder upload orchestration for marketplace template seeding

import { join } from 'node:path'

import type { ConvexHttpClient } from 'convex/browser'

import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { api } from '../../convex/_generated/api.js'
import { mapAsyncLimit } from '../../src/shared/lib/asyncMapLimit'
import {
  DEFAULT_META,
  EXAMPLES_DIR,
  FEATURED_RANKS,
  LABEL_DEFAULT_STYLE,
  SEED_ASSETS_DIR,
  SEED_CHUNK_UPLOAD_CONCURRENCY,
  SEED_FOLDER_CONCURRENCY,
} from './constants'
import {
  chunkItemsBySize,
  prepareFolder,
  probeFolder,
  toPayloadCoverImage,
  toPayloadItems,
} from './images'
import { TEMPLATE_META } from './catalog/manifest'
import { runActionWithRetry } from './retry'
import { titleizeFromFilename } from './text'
import type { FolderMeta, PreparedItem, SeedSummary, SeedTarget } from './types'

const resolveFolderMeta = (target: SeedTarget): FolderMeta =>
{
  const metaOverride: Partial<FolderMeta> = TEMPLATE_META[target.folder] ?? {}
  return {
    ...DEFAULT_META,
    ...metaOverride,
    category: target.category ?? metaOverride.category ?? DEFAULT_META.category,
  }
}

const appendChunkJobs = (
  chunks: PreparedItem[][]
): {
  chunk: PreparedItem[]
  chunkNumber: number
  startOrder: number
}[] =>
{
  const [, ...remainingChunks] = chunks
  const uploadJobs: {
    chunk: PreparedItem[]
    chunkNumber: number
    startOrder: number
  }[] = []
  let nextStartOrder = chunks[0]?.length ?? 0

  for (let i = 0; i < remainingChunks.length; i++)
  {
    const chunk = remainingChunks[i]
    uploadJobs.push({
      chunk,
      chunkNumber: i + 2,
      startOrder: nextStartOrder,
    })
    nextStartOrder += chunk.length
  }

  return uploadJobs
}

const seedFolder = async (
  client: ConvexHttpClient,
  target: SeedTarget,
  authorEmail: string,
  seedSecret: string
): Promise<string | null> =>
{
  const folderName = target.folder
  const meta = resolveFolderMeta(target)
  const folderPath = join(EXAMPLES_DIR, meta.category, folderName)
  const title = meta.title ?? titleizeFromFilename(folderName)
  const probes = await probeFolder(folderPath, meta.itemLabels)
  if (probes.length === 0)
  {
    process.stdout.write(`  . ${folderName}: no images found, skipping\n`)
    return null
  }

  const { templateRatio, ratioSource, items } = prepareFolder(probes)
  const labels: BoardLabelSettings | null =
    meta.labels === true ? LABEL_DEFAULT_STYLE : (meta.labels ?? null)
  const coverPayload = meta.coverImage
    ? await toPayloadCoverImage(join(SEED_ASSETS_DIR, meta.coverImage))
    : undefined

  const chunks = chunkItemsBySize(items)
  const cropped = items.filter((item) => item.transform !== null).length
  const ratioSourceLabel =
    ratioSource === 'mixed-dominant'
      ? 'mixed -> dominant'
      : ratioSource === 'mixed-square'
        ? 'mixed -> square'
        : 'consistent'
  process.stdout.write(
    `  . ${folderName}: ${items.length} items in ${chunks.length} chunk(s) @ ratio ${templateRatio.toFixed(3)} (${ratioSourceLabel}), ${cropped} cropped${labels ? ', labels on' : ''}${coverPayload ? ', cover' : ''}, uploading...\n`
  )

  const [firstChunk, ...remainingChunks] = chunks
  const firstChunkPayload = await toPayloadItems(firstChunk)
  const created = await runActionWithRetry(`${folderName} create`, () =>
    client.action(api.marketplace.templates.seed.seedTemplateFromBlobs, {
      seedSecret,
      authorEmail,
      title,
      description: meta.description ?? null,
      category: meta.category,
      tags: meta.tags ?? [],
      itemAspectRatio: templateRatio,
      labels,
      items: firstChunkPayload,
      ...(coverPayload ? { cover: coverPayload } : {}),
      ...(meta.suggestedTiers
        ? { suggestedTiers: [...meta.suggestedTiers] }
        : {}),
    })
  )

  let totalItems = created.itemsCreated
  const uploadJobs = appendChunkJobs(chunks)

  await mapAsyncLimit(
    uploadJobs,
    SEED_CHUNK_UPLOAD_CONCURRENCY,
    async ({ chunk, chunkNumber, startOrder }) =>
    {
      const chunkPayload = await toPayloadItems(chunk)
      const result = await runActionWithRetry(
        `${folderName} chunk ${chunkNumber}/${chunks.length}`,
        () =>
          client.action(
            api.marketplace.templates.seed.appendItemsToSeededTemplateBlobs,
            {
              authorEmail,
              seedSecret,
              slug: created.slug,
              startOrder,
              items: chunkPayload,
            }
          )
      )
      process.stdout.write(
        `    .. appended chunk ${chunkNumber}/${chunks.length} (${result.itemsAppended} items)\n`
      )
    }
  )

  if (remainingChunks.length > 0)
  {
    const finalized = await runActionWithRetry(`${folderName} finalize`, () =>
      client.action(
        api.marketplace.templates.seed.finalizeSeededTemplateChunks,
        {
          seedSecret,
          authorEmail,
          slug: created.slug,
          itemCount: items.length,
        }
      )
    )
    totalItems = finalized.totalItems
  }

  process.stdout.write(
    `    -> seeded slug=${created.slug} (${totalItems} items)\n`
  )

  const featuredRank = FEATURED_RANKS[folderName]
  if (featuredRank !== undefined)
  {
    await client.action(api.marketplace.templates.seed.promoteFeatured, {
      seedSecret,
      slug: created.slug,
      featuredRank,
    })
    process.stdout.write(
      `    -> promoted ${folderName} to featuredRank=${featuredRank}\n`
    )
  }
  return folderName
}

export const seedFolders = async (
  client: ConvexHttpClient,
  targets: SeedTarget[],
  authorEmail: string,
  seedSecret: string
): Promise<SeedSummary> =>
{
  let succeeded = 0
  let failed = 0
  let nextIndex = 0

  const runNext = async (): Promise<void> =>
  {
    while (nextIndex < targets.length)
    {
      const target = targets[nextIndex]
      nextIndex += 1

      try
      {
        const result = await seedFolder(client, target, authorEmail, seedSecret)
        if (result) succeeded += 1
      }
      catch (error)
      {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`  ! ${target.folder} failed: ${message}\n`)
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SEED_FOLDER_CONCURRENCY, targets.length) },
      runNext
    )
  )

  return { succeeded, failed }
}
