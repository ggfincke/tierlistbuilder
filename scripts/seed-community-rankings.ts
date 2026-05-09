#!/usr/bin/env tsx
// scripts/seed-community-rankings.ts
// CLI for community ranking seeding — logs reset + per-lane breakdown so
// multi-criterion templates show Comp vs Favs counts separately

import { ConvexHttpClient } from 'convex/browser'

import { api } from '../convex/_generated/api.js'
import { parseCommunityRankingSeedArgs } from './marketplace-seed/communityRankingArgs'
import { waitForCommunityRankingAggregates } from './marketplace-seed/communityRankingWait'
import { readSeedEnvironment } from './marketplace-seed/env'

interface SeedLaneBreakdown
{
  criterionExternalId: string
  criterionName: string
  sampleSeeded: number
  curatedSeeded: number
  curatedAuthors: string[]
}

interface SeedTargetResult
{
  key: 'ssbu' | 'zelda' | 'mcu'
  title: string
  slug: string
  itemCount: number
  rankingsSeeded: number
  rankingsDeleted: number
  laneBreakdown: SeedLaneBreakdown[]
}

interface SeedCuratedRankingResult
{
  targetKey: 'ssbu' | 'zelda' | 'mcu'
  targetTitle: string
  criterionExternalId: string
  authorKey: string
  authorDisplayName: string
  rankingTitle: string
  rankingSlug: string
}

const writeln = (line: string): void =>
{
  process.stdout.write(`${line}\n`)
}

const formatTargetSummary = (target: SeedTargetResult): string =>
{
  const indicator =
    target.rankingsDeleted > 0 ? ` (replaced ${target.rankingsDeleted})` : ''
  return (
    `  ${target.title}: ${target.rankingsSeeded} ranking(s), ` +
    `${target.itemCount} items, slug=${target.slug}${indicator}`
  )
}

const formatLaneLine = (lane: SeedLaneBreakdown): string =>
{
  const parts: string[] = []
  if (lane.sampleSeeded > 0) parts.push(`${lane.sampleSeeded} sample`)
  if (lane.curatedSeeded > 0)
  {
    const authors = lane.curatedAuthors.join(', ')
    parts.push(`${lane.curatedSeeded} curated (${authors})`)
  }
  if (parts.length === 0) parts.push('no rankings seeded')
  return `      ${lane.criterionName} [${lane.criterionExternalId}]: ${parts.join(' + ')}`
}

const printPlan = (reset: boolean, userCount: number | undefined): void =>
{
  const userPart =
    userCount === undefined
      ? '(default sample-profile count)'
      : `(${userCount} sample profile(s) per lane)`
  writeln(
    `seed plan: ${reset ? 'reset + ' : ''}seed competitive + favorites lanes ${userPart}`
  )
}

const printResetSummary = (reset: boolean, rankingsDeleted: number): void =>
{
  if (!reset) return
  writeln(`  --reset: removed ${rankingsDeleted} prior seeded ranking(s)`)
}

const printTotals = (result: {
  rankingsSeeded: number
  sampleRankingsSeeded: number
  curatedRankingsSeeded: number
  rankingsDeleted: number
  aggregatesQueued: number
  usersSeeded: number
}): void =>
{
  writeln(
    `seeded ${result.rankingsSeeded} ranking(s) total ` +
      `(${result.sampleRankingsSeeded} sample + ${result.curatedRankingsSeeded} curated) ` +
      `from ${result.usersSeeded} sample user(s); ` +
      `deleted ${result.rankingsDeleted}; ` +
      `queued ${result.aggregatesQueued} aggregate job(s)`
  )
}

const printCuratedSection = (
  curated: readonly SeedCuratedRankingResult[]
): void =>
{
  if (curated.length === 0) return
  writeln('curated rankings:')
  // group by target -> criterion for an indented breakdown that mirrors
  // the rest of the per-target output
  const byTarget = new Map<
    string,
    { targetTitle: string; entries: SeedCuratedRankingResult[] }
  >()
  for (const entry of curated)
  {
    const bucket = byTarget.get(entry.targetKey) ?? {
      targetTitle: entry.targetTitle,
      entries: [],
    }
    bucket.entries.push(entry)
    byTarget.set(entry.targetKey, bucket)
  }
  for (const [, group] of byTarget)
  {
    writeln(`  ${group.targetTitle}:`)
    for (const entry of group.entries)
    {
      writeln(
        `    - ${entry.authorDisplayName} · ${entry.rankingTitle} ` +
          `[${entry.criterionExternalId}] slug=${entry.rankingSlug}`
      )
    }
  }
}

const main = async (): Promise<void> =>
{
  const { reset, wait, userCount } = parseCommunityRankingSeedArgs(
    process.argv.slice(2)
  )
  const { convexUrl, seedSecret } = readSeedEnvironment()
  const client = new ConvexHttpClient(convexUrl)

  writeln(
    `seeding community rankings on ${convexUrl}${reset ? ' with reset' : ''}`
  )
  printPlan(reset, userCount)

  const result = await client.action(
    api.marketplace.rankings.seed.seedSampleCommunityRankings,
    {
      seedSecret,
      reset,
      ...(userCount === undefined ? {} : { userCount }),
    }
  )

  printResetSummary(reset, result.rankingsDeleted)
  printTotals(result)

  // per-target / per-lane block — matches the marketplace seeder's
  // indented per-folder output but slices by criterion lane so users see
  // exactly how many rankings landed in Comp vs Favs for each template
  for (const target of result.targets as SeedTargetResult[])
  {
    writeln(formatTargetSummary(target))
    for (const lane of target.laneBreakdown)
    {
      writeln(formatLaneLine(lane))
    }
  }

  printCuratedSection(
    result.curatedRankings as readonly SeedCuratedRankingResult[]
  )

  if (wait)
  {
    writeln('waiting for consensus aggregates...')
    await waitForCommunityRankingAggregates(
      client,
      result.targets as SeedTargetResult[]
    )
  }
}

main().catch((error) =>
{
  const stack = error instanceof Error ? (error.stack ?? error.message) : error
  process.stderr.write(`seed failed: ${stack}\n`)
  process.exit(1)
})
