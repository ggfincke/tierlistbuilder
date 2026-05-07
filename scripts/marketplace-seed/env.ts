// scripts/marketplace-seed/env.ts
// environment & timing helpers for marketplace seed CLIs

export interface SeedEnvironment
{
  convexUrl: string
  seedSecret: string
}

export const readSeedEnvironment = (): SeedEnvironment =>
{
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

  return { convexUrl, seedSecret }
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
