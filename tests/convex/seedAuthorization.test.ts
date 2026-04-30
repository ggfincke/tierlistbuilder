// tests/convex/seedAuthorization.test.ts
// Convex marketplace seed action authorization guardrails

import { convexTest } from 'convex-test'
import rateLimiter from '@convex-dev/rate-limiter/test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import schema from '../../convex/schema'
import { modules } from './convexTestHelpers'

const makeTest = (): ReturnType<typeof convexTest<typeof schema>> =>
{
  const t = convexTest({ schema, modules, transactionLimits: true })
  rateLimiter.register(t)
  return t
}

const SEED_SECRET = 'test-seed-secret'

const originalEnv = {
  enabled: process.env.CONVEX_SEED_ENABLED,
  secret: process.env.CONVEX_SEED_SECRET,
}

const restoreEnv = (): void =>
{
  if (originalEnv.enabled === undefined) delete process.env.CONVEX_SEED_ENABLED
  else process.env.CONVEX_SEED_ENABLED = originalEnv.enabled

  if (originalEnv.secret === undefined) delete process.env.CONVEX_SEED_SECRET
  else process.env.CONVEX_SEED_SECRET = originalEnv.secret
}

const disableSeeding = (): void =>
{
  delete process.env.CONVEX_SEED_ENABLED
  delete process.env.CONVEX_SEED_SECRET
}

const enableSeeding = (): void =>
{
  process.env.CONVEX_SEED_ENABLED = 'true'
  process.env.CONVEX_SEED_SECRET = SEED_SECRET
}

describe('marketplace seed authorization', () =>
{
  beforeEach(disableSeeding)
  afterEach(restoreEnv)

  it('rejects public seed status reads when seeding is disabled', async () =>
  {
    const t = makeTest()

    await expect(
      t.action(api.marketplace.templates.seed.getSeedUserStatus, {
        seedSecret: SEED_SECRET,
        email: 'seed@example.com',
      })
    ).rejects.toThrow(/seeding is disabled/)
  })

  it('rejects public maintenance mutations when the deployment secret is missing', async () =>
  {
    const t = makeTest()
    process.env.CONVEX_SEED_ENABLED = 'true'
    delete process.env.CONVEX_SEED_SECRET

    await expect(
      t.action(api.marketplace.templates.seed.clearAllFeaturedRanks, {
        seedSecret: SEED_SECRET,
      })
    ).rejects.toThrow(/seeding is locked/)
  })

  it('rejects destructive seed uploads when the caller secret is wrong', async () =>
  {
    const t = makeTest()
    enableSeeding()

    await expect(
      t.action(api.marketplace.templates.seed.seedTemplateFromBlobs, {
        seedSecret: 'wrong-secret',
        authorEmail: 'seed@example.com',
        title: 'Seed Template',
        description: null,
        category: 'movies',
        tags: [],
        itemAspectRatio: null,
        items: [],
      })
    ).rejects.toThrow(/seeding is locked/)
  })

  it('allows seed status reads only when the flag and secret both match', async () =>
  {
    const t = makeTest()
    enableSeeding()

    await expect(
      t.action(api.marketplace.templates.seed.getSeedUserStatus, {
        seedSecret: SEED_SECRET,
        email: 'seed@example.com',
      })
    ).resolves.toEqual({ accountExists: false })
  })
})
