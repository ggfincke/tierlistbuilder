#!/usr/bin/env tsx
// scripts/seed-community-rankings.ts
// dev seeding for sample community rankings on the featured templates

import { ConvexHttpClient } from 'convex/browser'

import { api } from '../convex/_generated/api.js'

const DEFAULT_WAIT_TIMEOUT_MS = 45_000
const WAIT_INTERVAL_MS = 750

interface ParsedArgs
{
  reset: boolean
  wait: boolean
  userCount: number | undefined
}

interface SeedTargetResult
{
  key: 'ssbu' | 'zelda' | 'mcu'
  title: string
  slug: string
  itemCount: number
  rankingsSeeded: number
  rankingsDeleted: number
}

const usage = (): never =>
{
  process.stderr.write(
    [
      'usage: tsx scripts/seed-community-rankings.ts [--reset] [--users=N] [--no-wait]',
      '',
      '  --reset       wipe seeded sample rankings before recreating them.',
      '  --users=N     number of sample users to seed. defaults to 16.',
      '  --no-wait     do not poll for consensus aggregate recomputes.',
      '',
      'environment (auto-loaded from .env.local via `tsx --env-file`):',
      '  CONVEX_URL / VITE_CONVEX_URL      deployment URL.',
      '  CONVEX_SEED_ENABLED              must be "true" on the deployment.',
      '  CONVEX_SEED_SECRET               must match the deployment value.',
      '',
    ].join('\n')
  )
  process.exit(1)
}

const parseUserCount = (value: string): number =>
{
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1)
  {
    process.stderr.write(`invalid --users value: ${value}\n`)
    usage()
  }
  return Math.floor(parsed)
}

const parseArgs = (rawArgs: string[]): ParsedArgs =>
{
  let reset = false
  let wait = true
  let userCount: number | undefined

  for (let i = 0; i < rawArgs.length; i++)
  {
    const arg = rawArgs[i]
    if (arg === '--reset')
    {
      reset = true
      continue
    }
    if (arg === '--no-wait')
    {
      wait = false
      continue
    }
    if (arg === '-h' || arg === '--help')
    {
      usage()
    }
    if (arg === '--users')
    {
      const value = rawArgs[i + 1]
      if (!value) usage()
      userCount = parseUserCount(value)
      i += 1
      continue
    }
    if (arg.startsWith('--users='))
    {
      userCount = parseUserCount(arg.slice('--users='.length))
      continue
    }

    process.stderr.write(`unknown argument: ${arg}\n`)
    usage()
  }

  return { reset, wait, userCount }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const waitForAggregates = async (
  client: ConvexHttpClient,
  targets: readonly SeedTargetResult[]
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

const main = async (): Promise<void> =>
{
  const { reset, wait, userCount } = parseArgs(process.argv.slice(2))
  const convexUrl = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL
  const seedSecret = process.env.CONVEX_SEED_SECRET

  if (!convexUrl)
  {
    process.stderr.write(
      'CONVEX_URL / VITE_CONVEX_URL is not set. add it to .env.local or export it.\n'
    )
    process.exit(1)
  }
  if (!seedSecret)
  {
    process.stderr.write(
      'CONVEX_SEED_SECRET is not set. add it to .env.local; must match the deployment value.\n'
    )
    process.exit(1)
  }

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
    await waitForAggregates(client, result.targets)
  }
}

main().catch((error) =>
{
  const stack = error instanceof Error ? (error.stack ?? error.message) : error
  process.stderr.write(`seed failed: ${stack}\n`)
  process.exit(1)
})
