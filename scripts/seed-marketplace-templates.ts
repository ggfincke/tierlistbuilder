#!/usr/bin/env tsx
// scripts/seed-marketplace-templates.ts
// dev seeding for the templates marketplace.

// walks /examples, probes each image w/ sharp to capture aspectRatio + auto-
// crop bbox, picks a per-template slot ratio (snap-to-preset majority), then
// bakes per-item transforms before posting chunked payloads over http.

// requires the seed author to already exist (sign up via the app first),
// CONVEX_URL set, & CONVEX_SEED_ENABLED=true on the deployment

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConvexHttpClient } from 'convex/browser'

import { api } from '../convex/_generated/api.js'
import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import {
  majorityAspectRatio,
  snapToNearestPreset,
} from '@tierlistbuilder/contracts/workspace/imageMath'
import { probeImage, resolveSeedAutoCropTransform } from './lib/autoCropDetect'
import { mapAsyncLimit } from '../src/shared/lib/asyncMapLimit'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const EXAMPLES_DIR = join(REPO_ROOT, 'examples')

const SEED_FOLDER_CONCURRENCY = 3
const SEED_ITEM_IO_CONCURRENCY = 8
const SEED_CHUNK_UPLOAD_CONCURRENCY = 2
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

interface FolderMeta
{
  title?: string
  category: string
  description: string | null
  tags: string[]
}

// folder slug -> { title, category, description, tags }. add new examples
// here when /examples grows
const TEMPLATE_META: Record<string, FolderMeta> = {
  'breakfast-cereals': {
    title: 'Breakfast cereals',
    category: 'food',
    description:
      'A pantry shelf of iconic breakfast cereals and cereal brands.',
    tags: ['food', 'cereal', 'breakfast'],
  },
  'fast-food-chains': {
    title: 'Fast food chains',
    category: 'food',
    description:
      'Major fast food and fast casual chains, from burgers to tacos.',
    tags: ['food', 'restaurants', 'fast food'],
  },
  'ice-cream-flavors': {
    title: 'Ice cream flavors',
    category: 'food',
    description:
      'Classic and regional ice cream flavors, with scoops and desserts as reference art.',
    tags: ['food', 'dessert', 'ice cream'],
  },
  'final-fantasy-mainline': {
    title: 'Final Fantasy mainline series',
    category: 'gaming',
    description:
      'Every numbered Final Fantasy game from FF I through XVI, in release order.',
    tags: ['rpg', 'final fantasy', 'square enix'],
  },
  'mario-kart-8-deluxe': {
    title: 'Mario Kart 8 Deluxe roster',
    category: 'gaming',
    description:
      'All 48 racers from Mario Kart 8 Deluxe, including DLC characters.',
    tags: ['nintendo', 'racing', 'mario kart'],
  },
  'mcu-posters': {
    title: 'MCU films',
    category: 'movies',
    description:
      'Every theatrical Marvel Cinematic Universe release, by poster art.',
    tags: ['marvel', 'mcu', 'films'],
  },
  'mcu-shows': {
    title: 'MCU streaming series',
    category: 'movies',
    description: 'Disney+ MCU shows from WandaVision onward.',
    tags: ['marvel', 'mcu', 'disney+'],
  },
  'mortal-kombat-1': {
    title: 'Mortal Kombat 1 roster',
    category: 'gaming',
    description: 'The base + Kombat Pack roster from Mortal Kombat 1 (2023).',
    tags: ['fighting', 'mortal kombat', 'netherrealm'],
  },
  'nba-teams': {
    title: 'NBA teams',
    category: 'sports',
    description: 'All 30 NBA franchises, by primary team logo.',
    tags: ['basketball', 'nba'],
  },
  'nfl-teams': {
    title: 'NFL teams',
    category: 'sports',
    description: 'All 32 NFL franchises, by primary team logo.',
    tags: ['football', 'nfl'],
  },
  'pixar-films': {
    title: 'Pixar feature films',
    category: 'movies',
    description: 'Every Pixar Animation Studios feature, by poster.',
    tags: ['pixar', 'animation', 'films'],
  },
  'pokemon-starters': {
    title: 'Pokémon starter trios',
    category: 'gaming',
    description: 'The first-stage starters from every mainline generation.',
    tags: ['pokemon', 'starters', 'nintendo'],
  },
  'premier-league-clubs': {
    title: 'Premier League clubs',
    category: 'sports',
    description: 'Every active Premier League club for the current season.',
    tags: ['football', 'soccer', 'premier league'],
  },
  'ssbu-fighters': {
    title: 'Super Smash Bros. Ultimate roster',
    category: 'gaming',
    description: 'All 87 fighters in Super Smash Bros. Ultimate, base + DLC.',
    tags: ['nintendo', 'fighting', 'smash bros'],
  },
  'star-wars-films': {
    title: 'Star Wars theatrical films',
    category: 'movies',
    description: 'Every theatrical Star Wars release, by poster.',
    tags: ['star wars', 'films', 'lucasfilm'],
  },
  'street-fighter-6': {
    title: 'Street Fighter 6 roster',
    category: 'gaming',
    description: 'Base + Year 1 + Year 2 fighters from Street Fighter 6.',
    tags: ['fighting', 'capcom', 'street fighter'],
  },
  'studio-ghibli': {
    title: 'Studio Ghibli films',
    category: 'movies',
    description: 'Every Studio Ghibli theatrical feature, by poster.',
    tags: ['ghibli', 'animation', 'films'],
  },
  'taylor-swift-albums': {
    title: 'Taylor Swift studio albums',
    category: 'music',
    description:
      "All of Taylor Swift's studio albums, including re-recordings.",
    tags: ['taylor swift', 'pop', 'albums'],
  },
  'zelda-games': {
    title: 'Legend of Zelda mainline',
    category: 'gaming',
    description: 'Every mainline Zelda title, by box art.',
    tags: ['zelda', 'nintendo', 'rpg'],
  },
}

const DEFAULT_META: FolderMeta = {
  category: 'other',
  description: null,
  tags: [],
}

const usage = (): never =>
{
  process.stderr.write(
    [
      'usage: tsx scripts/seed-marketplace-templates.ts <author-email> [folder...]',
      '',
      '  <author-email>   email of the user to attribute seeded templates to.',
      '                   the user must already exist (sign in once via the app).',
      '  [folder]         optional list of /examples subfolders to seed; if',
      '                   omitted, every folder under examples/ is seeded.',
      '',
      'environment:',
      '  CONVEX_URL                       deployment URL (eg https://your-dev.convex.cloud)',
      '  CONVEX_SEED_ENABLED              must be "true" on the deployment env vars',
      '                                   (set via `npx convex env set CONVEX_SEED_ENABLED true`)',
      '',
    ].join('\n')
  )
  process.exit(1)
}

const titleizeFromFilename = (filename: string): string =>
{
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const noPrefix = stem.replace(/^\d+[a-z]?[-_.]?/, '')
  return noPrefix
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

interface ProbedItem
{
  label: string
  filePath: string
  byteSize: number
  aspectRatio: number
  // bbox null when detection finds nothing useful (eg full-bleed photo);
  // transform stays null for those & the item falls back to imageFit/cover
  bbox: Awaited<ReturnType<typeof probeImage>>['bbox']
}

interface PreparedItem
{
  label: string
  filePath: string
  byteSize: number
  aspectRatio: number
  transform: ItemTransform | null
}

interface PreparedFolder
{
  templateRatio: number | null
  items: PreparedItem[]
}

const probeFolder = async (folderPath: string): Promise<ProbedItem[]> =>
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
      label: titleizeFromFilename(name),
      filePath,
      byteSize: buffer.byteLength,
      aspectRatio: probe.aspectRatio,
      bbox: probe.bbox,
    }
  })
}

// pick the template's slot ratio (snap-to-preset majority of per-item ratios)
// so each item's autocrop transform is computed against the same frame the
// forked board will use, then bake transforms against that ratio
const prepareFolder = (probes: ProbedItem[]): PreparedFolder =>
{
  const majority = majorityAspectRatio(probes.map((p) => p.aspectRatio))
  const templateRatio = majority === null ? null : snapToNearestPreset(majority)
  const frameRatio = templateRatio ?? 1
  const items = probes.map((probe) => ({
    label: probe.label,
    filePath: probe.filePath,
    byteSize: probe.byteSize,
    aspectRatio: probe.aspectRatio,
    transform: probe.bbox
      ? resolveSeedAutoCropTransform({
          imageAspectRatio: probe.aspectRatio,
          bbox: probe.bbox,
          boardAspectRatio: frameRatio,
        })
      : null,
  }))
  return { templateRatio, items }
}

// rough JSON-overhead floor per item — keeps chunked payloads under the
// action body limit. tuned conservatively against the ~8MB Convex action
// body cap; bigger values risk "BadJsonBody / length limit exceeded"
const MAX_CHUNK_BASE64_BYTES = 5 * 1024 * 1024

const estimateBase64Bytes = (byteSize: number): number =>
  Math.ceil(byteSize / 3) * 4

const chunkItemsBySize = (items: PreparedItem[]): PreparedItem[][] =>
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

const toPayloadItems = async (
  items: readonly PreparedItem[]
): Promise<
  {
    label: string
    contentBase64: string
    aspectRatio: number
    transform: ItemTransform | null
  }[]
> =>
  await mapAsyncLimit(items, SEED_ITEM_IO_CONCURRENCY, async (item) => ({
    label: item.label,
    contentBase64: (await readFile(item.filePath)).toString('base64'),
    aspectRatio: item.aspectRatio,
    transform: item.transform,
  }))

const seedFolder = async (
  client: ConvexHttpClient,
  folderName: string,
  authorEmail: string
): Promise<string | null> =>
{
  const folderPath = join(EXAMPLES_DIR, folderName)
  const meta: FolderMeta = {
    ...DEFAULT_META,
    ...(TEMPLATE_META[folderName] ?? {}),
  }
  const title = meta.title ?? titleizeFromFilename(folderName)
  const probes = await probeFolder(folderPath)
  if (probes.length === 0)
  {
    process.stdout.write(`  · ${folderName}: no images found, skipping\n`)
    return null
  }

  const { templateRatio, items } = prepareFolder(probes)

  const chunks = chunkItemsBySize(items)
  process.stdout.write(
    `  · ${folderName}: ${items.length} items in ${chunks.length} chunk(s) @ ratio ${templateRatio?.toFixed(3) ?? 'auto'}, uploading…\n`
  )

  const [firstChunk, ...remainingChunks] = chunks
  const created = await client.action(
    api.marketplace.templates.seed.seedTemplateFromBlobs,
    {
      authorEmail,
      title,
      description: meta.description ?? null,
      category: meta.category,
      tags: meta.tags ?? [],
      itemAspectRatio: templateRatio,
      items: await toPayloadItems(firstChunk),
    }
  )

  let totalItems = created.itemsCreated
  const uploadJobs: {
    chunk: PreparedItem[]
    chunkNumber: number
    startOrder: number
  }[] = []
  let nextStartOrder = firstChunk.length
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

  await mapAsyncLimit(
    uploadJobs,
    SEED_CHUNK_UPLOAD_CONCURRENCY,
    async ({ chunk, chunkNumber, startOrder }) =>
    {
      const result = await client.action(
        api.marketplace.templates.seed.appendItemsToSeededTemplateBlobs,
        {
          authorEmail,
          slug: created.slug,
          startOrder,
          items: await toPayloadItems(chunk),
        }
      )
      process.stdout.write(
        `    .. appended chunk ${chunkNumber}/${chunks.length} (${result.itemsAppended} items)\n`
      )
    }
  )

  if (remainingChunks.length > 0)
  {
    const finalized = await client.action(
      api.marketplace.templates.seed.finalizeSeededTemplateChunks,
      {
        authorEmail,
        slug: created.slug,
        itemCount: items.length,
      }
    )
    totalItems = finalized.totalItems
  }

  process.stdout.write(
    `    -> seeded slug=${created.slug} (${totalItems} items)\n`
  )
  return folderName
}

interface SeedSummary
{
  succeeded: number
  failed: number
}

const seedFolders = async (
  client: ConvexHttpClient,
  targetFolders: string[],
  authorEmail: string
): Promise<SeedSummary> =>
{
  let succeeded = 0
  let failed = 0
  let nextIndex = 0

  const runNext = async (): Promise<void> =>
  {
    while (nextIndex < targetFolders.length)
    {
      const folderName = targetFolders[nextIndex]
      nextIndex += 1

      try
      {
        const result = await seedFolder(client, folderName, authorEmail)
        if (result) succeeded += 1
      }
      catch (error)
      {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        process.stderr.write(`  ! ${folderName} failed: ${message}\n`)
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SEED_FOLDER_CONCURRENCY, targetFolders.length) },
      runNext
    )
  )

  return { succeeded, failed }
}

const main = async (): Promise<void> =>
{
  const [authorEmail, ...folders] = process.argv.slice(2)
  if (!authorEmail || authorEmail.startsWith('-'))
  {
    usage()
  }

  const convexUrl = process.env.CONVEX_URL
  if (!convexUrl)
  {
    process.stderr.write(
      'CONVEX_URL is not set. export it from your .env.local or run via `npx convex env`\n'
    )
    process.exit(1)
  }

  const client = new ConvexHttpClient(convexUrl)
  const targetFolders =
    folders.length > 0
      ? folders
      : (await readdir(EXAMPLES_DIR, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort()

  process.stdout.write(
    `seeding ${targetFolders.length} template(s) as ${authorEmail} on ${convexUrl}\n`
  )

  const { succeeded, failed } = await seedFolders(
    client,
    targetFolders,
    authorEmail
  )

  process.stdout.write(
    `\ndone — ${succeeded} succeeded, ${failed} failed of ${targetFolders.length}\n`
  )
  if (failed > 0) process.exit(1)
}

main().catch((error) =>
{
  const stack = error instanceof Error ? (error.stack ?? error.message) : error
  process.stderr.write(`seed failed: ${stack}\n`)
  process.exit(1)
})
