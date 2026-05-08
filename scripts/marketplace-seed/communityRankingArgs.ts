// scripts/marketplace-seed/communityRankingArgs.ts
// argument parsing for community ranking seeding

export interface ParsedCommunityRankingSeedArgs
{
  reset: boolean
  wait: boolean
  userCount: number | undefined
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

export const parseCommunityRankingSeedArgs = (
  rawArgs: string[]
): ParsedCommunityRankingSeedArgs =>
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
