// scripts/marketplace-seed/communityRankingWait.ts
// polls consensus aggregates after community ranking seeding; emits one
// "aggregate ready" line per (target, criterion) lane

import type { ConvexHttpClient } from 'convex/browser'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../convex/_generated/api.js'
import { sleep } from './env'

type SeedResult = FunctionReturnType<
  typeof api.marketplace.rankings.seed.seedSampleCommunityRankings
>
type SeedTargetResult = SeedResult['targets'][number]

const DEFAULT_WAIT_TIMEOUT_MS = 60_000
const WAIT_INTERVAL_MS = 750

interface PendingLane
{
  slug: string
  title: string
  criterionExternalId: string
  criterionName: string
  expectedRankings: number
}

const buildPendingLanes = (
  targets: readonly SeedTargetResult[]
): PendingLane[] =>
{
  const pending: PendingLane[] = []
  for (const target of targets)
  {
    for (const lane of target.laneBreakdown)
    {
      const expected = lane.sampleSeeded + lane.curatedSeeded
      if (expected <= 0) continue
      pending.push({
        slug: target.slug,
        title: target.title,
        criterionExternalId: lane.criterionExternalId,
        criterionName: lane.criterionName,
        expectedRankings: expected,
      })
    }
  }
  return pending
}

const laneKey = (slug: string, criterionExternalId: string): string =>
  `${slug}::${criterionExternalId}`

export const waitForCommunityRankingAggregates = async (
  client: ConvexHttpClient,
  targets: readonly SeedTargetResult[]
): Promise<void> =>
{
  const lanes = buildPendingLanes(targets)
  if (lanes.length === 0) return
  const pending = new Map(
    lanes.map((lane) => [laneKey(lane.slug, lane.criterionExternalId), lane])
  )
  const deadline = Date.now() + DEFAULT_WAIT_TIMEOUT_MS

  while (pending.size > 0 && Date.now() < deadline)
  {
    for (const [key, lane] of pending)
    {
      const aggregate = await client.query(
        api.marketplace.rankings.queries.getTemplateRankingAggregate,
        {
          templateSlug: lane.slug,
          criterionExternalId: lane.criterionExternalId,
        }
      )
      if (
        aggregate?.state === 'ready' &&
        aggregate.rankingCount >= lane.expectedRankings
      )
      {
        process.stdout.write(
          `  aggregate ready: ${lane.title} / ${lane.criterionName} ` +
            `(${aggregate.rankingCount} ranking samples)\n`
        )
        pending.delete(key)
      }
    }

    if (pending.size > 0)
    {
      await sleep(WAIT_INTERVAL_MS)
    }
  }

  if (pending.size > 0)
  {
    const names = [...pending.values()]
      .map((lane) => `${lane.title} / ${lane.criterionName}`)
      .join(', ')
    process.stdout.write(
      `  aggregate recompute still running after ${DEFAULT_WAIT_TIMEOUT_MS / 1000}s: ${names}\n`
    )
  }
}
