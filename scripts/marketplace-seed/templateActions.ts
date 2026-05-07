// scripts/marketplace-seed/templateActions.ts
// Convex account, reset, & curation actions for template seeds

import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api.js'
import { DEFAULT_SEED_AUTHOR, FEATURED_RANKS } from './constants'
import type { SeedTarget } from './types'

const isDefaultSeedAuthor = (email: string): boolean =>
  email.trim().toLowerCase() === DEFAULT_SEED_AUTHOR.email

export const ensureDefaultSeedAuthor = async (
  client: ConvexHttpClient,
  authorEmail: string,
  seedSecret: string
): Promise<void> =>
{
  if (!isDefaultSeedAuthor(authorEmail))
  {
    return
  }

  const status = await client.action(
    api.marketplace.templates.seed.getSeedUserStatus,
    { seedSecret, email: DEFAULT_SEED_AUTHOR.email }
  )
  await client.action(api.auth.signIn, {
    provider: 'password',
    params: {
      flow: status.accountExists ? 'signIn' : 'signUp',
      email: DEFAULT_SEED_AUTHOR.email,
      password: DEFAULT_SEED_AUTHOR.password,
    },
    calledBy: 'seed-marketplace-templates',
  })
  const profile = await client.action(
    api.marketplace.templates.seed.patchSeedUserProfile,
    {
      seedSecret,
      email: DEFAULT_SEED_AUTHOR.email,
      displayName: DEFAULT_SEED_AUTHOR.displayName,
    }
  )
  if (!profile.found)
  {
    throw new Error(`seed author missing after sign-up: ${authorEmail}`)
  }
  process.stdout.write(
    `seed author ready: ${DEFAULT_SEED_AUTHOR.displayName} <${DEFAULT_SEED_AUTHOR.email}>\n`
  )
}

export const wipeSeededTemplateData = async (
  client: ConvexHttpClient,
  seedSecret: string
): Promise<void> =>
{
  process.stdout.write('--reset: wiping templates, forked boards, & stats...\n')
  const totals = await client.action(
    api.marketplace.templates.seed.wipeSeededDataBatch,
    { seedSecret }
  )
  process.stdout.write(
    `  wiped ${totals.templatesDeleted} template(s), ` +
      `${totals.itemsDeleted} item(s), ${totals.tagsDeleted} tag(s), ` +
      `${totals.cardsDeleted} card(s), ${totals.statsDeleted} stat row(s); ` +
      `${totals.boardsDeleted} forked board(s) with ` +
      `${totals.boardItemsDeleted} item(s) & ${totals.boardTiersDeleted} tier(s); ` +
      `marketplaceStats cleared=${totals.marketplaceStatsCleared}\n`
  )
}

export const targetListIncludesFeatured = (
  targets: readonly SeedTarget[]
): boolean => targets.some((target) => target.folder in FEATURED_RANKS)

export const clearAllFeaturedRanks = async (
  client: ConvexHttpClient,
  seedSecret: string
): Promise<void> =>
{
  const { cleared } = await client.action(
    api.marketplace.templates.seed.clearAllFeaturedRanks,
    { seedSecret }
  )
  process.stdout.write(`cleared ${cleared} prior featured rank(s)\n`)
}
