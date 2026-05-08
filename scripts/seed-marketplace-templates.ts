#!/usr/bin/env tsx
// scripts/seed-marketplace-templates.ts
// CLI entrypoint for marketplace template seeding

import { ConvexHttpClient } from 'convex/browser'

import {
  discoverSeedTargets,
  resolveSeedTargets,
} from './marketplace-seed/discovery'
import { readSeedEnvironment } from './marketplace-seed/env'
import { parseTemplateSeedArgs } from './marketplace-seed/templateArgs'
import {
  clearAllFeaturedRanks,
  ensureDefaultSeedAuthor,
  targetListIncludesFeatured,
  wipeSeededTemplateData,
} from './marketplace-seed/templateActions'
import { seedFolders } from './marketplace-seed/templateSeeder'

const main = async (): Promise<void> =>
{
  const { authorEmail, folders, reset } = parseTemplateSeedArgs(
    process.argv.slice(2)
  )
  const { convexUrl, seedSecret } = readSeedEnvironment()
  const client = new ConvexHttpClient(convexUrl)

  if (reset)
  {
    await wipeSeededTemplateData(client, seedSecret)
  }

  await ensureDefaultSeedAuthor(client, authorEmail, seedSecret)

  const discovered = await discoverSeedTargets()
  const targets = resolveSeedTargets(discovered, folders)

  process.stdout.write(
    `seeding ${targets.length} template(s) as ${authorEmail} on ${convexUrl}\n`
  )

  if (targetListIncludesFeatured(targets))
  {
    await clearAllFeaturedRanks(client, seedSecret)
  }

  const { succeeded, failed } = await seedFolders(
    client,
    targets,
    authorEmail,
    seedSecret
  )

  process.stdout.write(
    `\ndone - ${succeeded} succeeded, ${failed} failed of ${targets.length}\n`
  )
  if (failed > 0) process.exit(1)
}

main().catch((error) =>
{
  const stack = error instanceof Error ? (error.stack ?? error.message) : error
  process.stderr.write(`seed failed: ${stack}\n`)
  process.exit(1)
})
