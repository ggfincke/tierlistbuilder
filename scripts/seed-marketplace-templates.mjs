#!/usr/bin/env node
// scripts/seed-marketplace-templates.mjs
// dev seeding for the templates marketplace — walks /examples, base64-encodes
// each image set, & posts to the seedTemplateFromBlobs action via convex http
// client. requires the seed author to already exist (sign up via the app
// first), CONVEX_URL set, & CONVEX_SEED_ENABLED=true on the deployment

import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConvexHttpClient } from 'convex/browser'

import { api } from '../convex/_generated/api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const EXAMPLES_DIR = join(REPO_ROOT, 'examples')
const TMP_DIR = join(REPO_ROOT, '.tmp', 'marketplace-seed')

const SEED_FOLDER_CONCURRENCY = 3
const SUPPORTED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const EXTENSION_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

// folder slug -> { title, category, description, tags }. add new examples
// here when /examples grows
const TEMPLATE_META = {
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

const DEFAULT_META = {
  category: 'other',
  description: null,
  tags: [],
}

const usage = () =>
{
  process.stderr.write(
    [
      'usage: node scripts/seed-marketplace-templates.mjs <author-email> [folder...]',
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

const titleizeFromFilename = (filename) =>
{
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const noPrefix = stem.replace(/^\d+[-_\.]?/, '')
  return noPrefix
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

const buildItemsForFolder = async (folderPath) =>
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

  const items = []
  for (const name of files)
  {
    const dot = name.lastIndexOf('.')
    const ext = name.slice(dot).toLowerCase()
    const mimeType = EXTENSION_MIME[ext]
    if (!mimeType) continue
    const buffer = await readFile(join(folderPath, name))
    items.push({
      label: titleizeFromFilename(name),
      contentBase64: buffer.toString('base64'),
      mimeType,
    })
  }
  return items
}

// rough JSON-overhead floor per item — base64 + label + envelope keys. used
// to keep chunked payloads under the action body limit. anything larger than
// this on the wire & we split. tuned conservatively against the ~8MB Convex
// action body cap; bigger values risk "BadJsonBody / length limit exceeded"
const MAX_CHUNK_BASE64_BYTES = 5 * 1024 * 1024

const chunkItemsBySize = (items) =>
{
  const chunks = []
  let current = []
  let currentSize = 0

  for (const item of items)
  {
    const itemSize = item.contentBase64.length
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

const seedFolder = async (client, folderName, authorEmail) =>
{
  const folderPath = join(EXAMPLES_DIR, folderName)
  const meta = { ...DEFAULT_META, ...(TEMPLATE_META[folderName] ?? {}) }
  const title = meta.title ?? titleizeFromFilename(folderName)
  const items = await buildItemsForFolder(folderPath)
  if (items.length === 0)
  {
    process.stdout.write(`  · ${folderName}: no images found, skipping\n`)
    return null
  }

  const chunks = chunkItemsBySize(items)
  process.stdout.write(
    `  · ${folderName}: ${items.length} items in ${chunks.length} chunk(s), uploading…\n`
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
      items: firstChunk.map(({ label, contentBase64 }) => ({
        label,
        contentBase64,
      })),
    }
  )

  let totalItems = created.itemsCreated
  for (let i = 0; i < remainingChunks.length; i++)
  {
    const chunk = remainingChunks[i]
    const result = await client.action(
      api.marketplace.templates.seed.appendItemsToSeededTemplateBlobs,
      {
        authorEmail,
        slug: created.slug,
        items: chunk.map(({ label, contentBase64 }) => ({
          label,
          contentBase64,
        })),
      }
    )
    totalItems = result.totalItems
    process.stdout.write(
      `    .. appended chunk ${i + 2}/${chunks.length} (${result.itemsAppended} items, ${totalItems} total)\n`
    )
  }

  process.stdout.write(
    `    -> seeded slug=${created.slug} (${totalItems} items)\n`
  )
  return folderName
}

const seedFolders = async (client, targetFolders, authorEmail) =>
{
  let succeeded = 0
  let failed = 0
  let nextIndex = 0

  const runNext = async () =>
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
        process.stderr.write(
          `  ! ${folderName} failed: ${error?.message ?? error}\n`
        )
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

const main = async () =>
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
  await mkdir(TMP_DIR, { recursive: true })

  const { succeeded, failed } = await seedFolders(
    client,
    targetFolders,
    authorEmail
  )

  await rm(TMP_DIR, { recursive: true, force: true })
  process.stdout.write(
    `\ndone — ${succeeded} succeeded, ${failed} failed of ${targetFolders.length}\n`
  )
  if (failed > 0) process.exit(1)
}

main().catch((error) =>
{
  process.stderr.write(
    `seed failed: ${error?.stack ?? error?.message ?? error}\n`
  )
  process.exit(1)
})
