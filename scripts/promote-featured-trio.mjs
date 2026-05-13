// scripts/promote-featured-trio.mjs
// Set the homepage hero trio by seed externalId. Reads .env.local for the
// Convex deployment URL + seed secret and calls the seed-gated action that
// clears existing featuredRanks and assigns 0/1/2 in the order listed below.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ConvexHttpClient } from 'convex/browser'

// curated trio: ssbu first (large hero), then zelda + mcu in the secondary slots
const DATASET_KEY = 'marketplace-core'
const RELEASE_ID = '2026-05-templates-v2'
const FEATURED_EXTERNAL_IDS = [
  'gaming:ssbu-fighters',
  'gaming:zelda-games',
  'movies:entire-mcu',
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const loadDotenv = (path) =>
{
  const env = {}
  try
  {
    const raw = readFileSync(path, 'utf8')
    for (const line of raw.split('\n'))
    {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      // strip a single layer of matched quotes so quoted dotenv values pass
      // through unchanged into process.env-like consumers downstream
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
      {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
  }
  catch
  {
    // missing file is fine; we fall back to process.env below
  }
  return env
}

const env = { ...loadDotenv(resolve(repoRoot, '.env.local')), ...process.env }

const convexUrl =
  env.CONVEX_URL ||
  env.VITE_CONVEX_URL ||
  env.CONVEX_SITE_URL ||
  env.VITE_CONVEX_SITE_URL
if (!convexUrl)
{
  console.error('CONVEX_URL not set in .env.local or env')
  process.exit(1)
}
const seedSecret = env.CONVEX_SEED_SECRET
if (!seedSecret)
{
  console.error('CONVEX_SEED_SECRET not set in .env.local or env')
  process.exit(1)
}

const client = new ConvexHttpClient(convexUrl)
const result = await client.action(
  'marketplace/templates/seed:setFeaturedTrioByExternalIds',
  {
    seedSecret,
    datasetKey: DATASET_KEY,
    releaseId: RELEASE_ID,
    externalIds: FEATURED_EXTERNAL_IDS,
  }
)

console.log(`cleared ${result.cleared} prior featured rank(s)`)
for (const entry of result.promoted)
{
  console.log(
    `  rank ${entry.featuredRank}: ${entry.externalId} → /templates/${entry.slug}`
  )
}
