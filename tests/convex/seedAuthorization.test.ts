// tests/convex/seedAuthorization.test.ts
// marketplace seed action authorization gates

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import {
  captureSeedEnv,
  makeRateLimitedTest as makeTest,
  restoreSeedEnv,
} from './convexTestHelpers'

const SEED_SECRET = 'test-seed-secret'
const originalEnv = captureSeedEnv()

const restoreEnv = (): void =>
{
  restoreSeedEnv(originalEnv)
}

describe('marketplace seed authorization', () =>
{
  beforeEach(() =>
  {
    delete process.env.CONVEX_SEED_ENABLED
    delete process.env.CONVEX_SEED_SECRET
  })
  afterEach(restoreEnv)

  it('rejects seed actions when flag/secret missing or wrong; allows when both match', async () =>
  {
    const t = makeTest()

    await expect(
      t.action(api.marketplace.templates.seed.getSeedUserStatus, {
        seedSecret: SEED_SECRET,
        email: 'seed@example.com',
      })
    ).rejects.toThrow(/seeding is disabled/)

    process.env.CONVEX_SEED_ENABLED = 'true'
    delete process.env.CONVEX_SEED_SECRET
    await expect(
      t.action(api.marketplace.templates.seed.clearAllFeaturedRanks, {
        seedSecret: SEED_SECRET,
      })
    ).rejects.toThrow(/seeding is locked/)

    process.env.CONVEX_SEED_SECRET = SEED_SECRET
    await expect(
      t.action(api.marketplace.templates.seed.getSeedUserStatus, {
        seedSecret: 'wrong-secret',
        email: 'seed@example.com',
      })
    ).rejects.toThrow(/seeding is locked/)

    await expect(
      t.action(api.marketplace.templates.seed.getSeedUserStatus, {
        seedSecret: SEED_SECRET,
        email: 'seed@example.com',
      })
    ).resolves.toEqual({ accountExists: false })
  })
})
