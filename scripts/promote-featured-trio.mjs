// scripts/promote-featured-trio.mjs
// Set the homepage hero trio by seed externalId. Reads .env.local for the
// Convex site URL + seed secret and posts to the seed-gated HTTP route that
// clears existing featuredRanks and assigns 0/1/2 in the order listed below.

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

// curated trio: ssbu first (large hero), then zelda + mcu in the secondary slots
export const DATASET_KEY = 'marketplace-core'
export const RELEASE_ID = '2026-05-templates-v2'
export const FEATURED_EXTERNAL_IDS = [
  'gaming:ssbu-fighters',
  'gaming:zelda-games',
  'movies:entire-mcu',
]
export const FEATURED_TRIO_ROUTE = '/api/seed/featured-trio'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

export const loadDotenv = (path) =>
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

const trimTrailingSlashes = (value) => value.replace(/\/+$/, '')

export const normalizeConvexSiteUrl = (url) =>
{
  const trimmed = url.trim()
  try
  {
    const parsed = new URL(trimmed)
    const hostname = parsed.hostname.toLowerCase()
    if (hostname.endsWith('.convex.cloud'))
    {
      parsed.hostname = hostname.replace(/\.convex\.cloud$/, '.convex.site')
    }
    if (
      (hostname === '127.0.0.1' || hostname === 'localhost') &&
      parsed.port === '3210'
    )
    {
      parsed.port = '3211'
    }
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname
    return trimTrailingSlashes(`${parsed.protocol}//${parsed.host}${pathname}`)
  }
  catch
  {
    return trimTrailingSlashes(trimmed)
  }
}

const firstString = (values) =>
  values.find((value) => typeof value === 'string' && value.length > 0)

export const resolveConvexSiteUrl = ({
  env = process.env,
  dotenvEnv = {},
  override,
} = {}) =>
{
  const value = firstString([
    override,
    env.CONVEX_SITE_URL,
    env.VITE_CONVEX_SITE_URL,
    env.CONVEX_URL,
    env.VITE_CONVEX_URL,
    dotenvEnv.CONVEX_SITE_URL,
    dotenvEnv.VITE_CONVEX_SITE_URL,
    dotenvEnv.CONVEX_URL,
    dotenvEnv.VITE_CONVEX_URL,
  ])
  return value ? normalizeConvexSiteUrl(value) : null
}

export const featuredTrioRequestBody = () => ({
  datasetKey: DATASET_KEY,
  releaseId: RELEASE_ID,
  externalIds: FEATURED_EXTERNAL_IDS,
})

const readJsonResponse = async (response) =>
{
  const text = await response.text()
  if (text.length === 0) return null
  return JSON.parse(text)
}

const seedErrorMessage = (payload, status) =>
{
  if (payload && typeof payload === 'object')
  {
    if (typeof payload.errorMessage === 'string') return payload.errorMessage
    if (typeof payload.message === 'string') return payload.message
  }
  return `seed featured trio request failed with HTTP ${status}`
}

const scrubSecret = (message, seedSecret) =>
  message.replaceAll(seedSecret, '[redacted-seed-secret]')

export const postFeaturedTrio = async ({
  siteUrl,
  seedSecret,
  fetchImpl = fetch,
} = {}) =>
{
  const body = featuredTrioRequestBody()
  const response = await fetchImpl(
    `${trimTrailingSlashes(siteUrl)}${FEATURED_TRIO_ROUTE}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${seedSecret}`,
      },
      body: JSON.stringify(body),
    }
  )
  const payload = await readJsonResponse(response)
  if (!response.ok || payload?.status !== 'success')
  {
    throw new Error(
      scrubSecret(seedErrorMessage(payload, response.status), seedSecret)
    )
  }
  return payload.value
}

export const promoteFeaturedTrio = async ({
  env = process.env,
  dotenvPath = resolve(repoRoot, '.env.local'),
  fetchImpl = fetch,
} = {}) =>
{
  const dotenvEnv = loadDotenv(dotenvPath)
  const siteUrl = resolveConvexSiteUrl({ env, dotenvEnv })
  if (!siteUrl)
  {
    throw new Error(
      'CONVEX_SITE_URL / VITE_CONVEX_SITE_URL / CONVEX_URL / VITE_CONVEX_URL is not set in .env.local or env'
    )
  }

  const seedSecret = env.CONVEX_SEED_SECRET || dotenvEnv.CONVEX_SEED_SECRET
  if (!seedSecret)
  {
    throw new Error('CONVEX_SEED_SECRET not set in .env.local or env')
  }

  return await postFeaturedTrio({ siteUrl, seedSecret, fetchImpl })
}

const printResult = (result) =>
{
  console.log(`cleared ${result.cleared} prior featured rank(s)`)
  for (const entry of result.promoted)
  {
    console.log(
      `  rank ${entry.featuredRank}: ${entry.externalId} -> /templates/${entry.slug}`
    )
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectRun)
{
  promoteFeaturedTrio()
    .then(printResult)
    .catch((error) =>
    {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
