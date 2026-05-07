#!/usr/bin/env tsx
// scripts/seed-community-rankings.ts
// CLI entrypoint for sample community ranking seeding

import { ConvexHttpClient } from 'convex/browser'

import { api } from '../convex/_generated/api.js'
import { parseCommunityRankingSeedArgs } from './marketplace-seed/communityRankingArgs'
import { waitForCommunityRankingAggregates } from './marketplace-seed/communityRankingWait'
import { readSeedEnvironment } from './marketplace-seed/env'

const main = async (): Promise<void> =>
{
  const { reset, wait, userCount } = parseCommunityRankingSeedArgs(
    process.argv.slice(2)
  )
  const { convexUrl, seedSecret } = readSeedEnvironment()
  const client = new ConvexHttpClient(convexUrl)

  process.stdout.write(
    `seeding community rankings on ${convexUrl}${reset ? ' with reset' : ''}\n`
  )

  const result = await client.action(
    api.marketplace.rankings.seed.seedSampleCommunityRankings,
    {
      seedSecret,
      reset,
      ...(userCount === undefined ? {} : { userCount }),
    }
  )

  process.stdout.write(
    `seeded ${result.rankingsSeeded} ranking(s) from ${result.usersSeeded} user(s); ` +
      `deleted ${result.rankingsDeleted}; queued ${result.aggregatesQueued} aggregate job(s)\n`
  )

  for (const target of result.targets)
  {
    process.stdout.write(
      `  ${target.title}: ${target.rankingsSeeded} ranking(s), ` +
        `${target.itemCount} items, slug=${target.slug}\n`
    )
  }

  if (wait)
  {
    process.stdout.write('waiting for consensus aggregates...\n')
    await waitForCommunityRankingAggregates(client, result.targets)
  }
}

main().catch((error) =>
{
  const stack = error instanceof Error ? (error.stack ?? error.message) : error
  process.stderr.write(`seed failed: ${stack}\n`)
  process.exit(1)
})
