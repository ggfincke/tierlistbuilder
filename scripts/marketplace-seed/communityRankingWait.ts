// scripts/marketplace-seed/communityRankingWait.ts
// poll consensus aggregates after community ranking seeding

import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api.js'
import { sleep } from './env'

const DEFAULT_WAIT_TIMEOUT_MS = 45_000
const WAIT_INTERVAL_MS = 750

interface CommunityRankingSeedTargetResult
{
  key: 'ssbu' | 'zelda' | 'mcu'
  title: string
  slug: string
  itemCount: number
  rankingsSeeded: number
  rankingsDeleted: number
}

export const waitForCommunityRankingAggregates = async (
  client: ConvexHttpClient,
  targets: readonly CommunityRankingSeedTargetResult[]
): Promise<void> =>
{
  const pending = new Map(targets.map((target) => [target.slug, target]))
  const deadline = Date.now() + DEFAULT_WAIT_TIMEOUT_MS

  while (pending.size > 0 && Date.now() < deadline)
  {
    for (const [slug, target] of pending)
    {
      const aggregate = await client.query(
        api.marketplace.rankings.queries.getTemplateRankingAggregate,
        { templateSlug: slug }
      )
      if (
        aggregate?.state === 'ready' &&
        aggregate.rankingCount >= target.rankingsSeeded
      )
      {
        process.stdout.write(
          `  aggregate ready: ${target.title} (${aggregate.rankingCount} ranking samples)\n`
        )
        pending.delete(slug)
      }
    }

    if (pending.size > 0)
    {
      await sleep(WAIT_INTERVAL_MS)
    }
  }

  if (pending.size > 0)
  {
    const names = [...pending.values()].map((target) => target.title).join(', ')
    process.stdout.write(
      `  aggregate recompute still running after ${DEFAULT_WAIT_TIMEOUT_MS / 1000}s: ${names}\n`
    )
  }
}
