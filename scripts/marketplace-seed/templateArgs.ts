// scripts/marketplace-seed/templateArgs.ts
// argument parsing for marketplace template seeding

import { DEFAULT_SEED_AUTHOR } from './constants'

export interface ParsedTemplateSeedArgs
{
  authorEmail: string
  folders: string[]
  reset: boolean
}

const usage = (): never =>
{
  process.stderr.write(
    [
      'usage: tsx scripts/seed-marketplace-templates.ts [--reset] [author-email] [folder...]',
      '',
      '  --reset          wipe all templates, forked boards, and marketplace',
      '                   stats before seeding. (preserves user accounts.)',
      `  [author-email]   email of the user to attribute seeded templates to.`,
      `                   defaults to ${DEFAULT_SEED_AUTHOR.email}; that account`,
      '                   is created/verified automatically for local seeding.',
      '  [folder]         optional list of /examples subfolders to seed; if',
      '                   omitted, every folder under examples/ is seeded.',
      '',
      'environment (auto-loaded from .env.local via `tsx --env-file`):',
      '  CONVEX_URL                       deployment URL. falls back to',
      '                                   VITE_CONVEX_URL if unset.',
      '  CONVEX_SEED_ENABLED              must be "true" on the deployment env vars',
      '                                   (set via `npx convex env set CONVEX_SEED_ENABLED true`)',
      '  CONVEX_SEED_SECRET               must be set locally and on the deployment',
      '',
    ].join('\n')
  )
  process.exit(1)
}

export const parseTemplateSeedArgs = (
  rawArgs: string[]
): ParsedTemplateSeedArgs =>
{
  let reset = false
  const positional: string[] = []
  for (const arg of rawArgs)
  {
    if (arg === '--reset')
    {
      reset = true
      continue
    }
    if (arg === '-h' || arg === '--help')
    {
      usage()
    }
    if (arg.startsWith('-'))
    {
      process.stderr.write(`unknown flag: ${arg}\n`)
      usage()
    }
    positional.push(arg)
  }

  const [firstArg, ...rest] = positional
  if (!firstArg)
  {
    return { authorEmail: DEFAULT_SEED_AUTHOR.email, folders: [], reset }
  }

  if (firstArg.includes('@'))
  {
    return { authorEmail: firstArg.trim().toLowerCase(), folders: rest, reset }
  }

  return { authorEmail: DEFAULT_SEED_AUTHOR.email, folders: positional, reset }
}
