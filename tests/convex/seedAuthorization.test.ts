// tests/convex/seedAuthorization.test.ts
// shared seed-route authorization gate, exercised through a query-kind route

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CONVEX_ERROR_CODES } from '@tierlistbuilder/contracts/platform/errors'
import {
  captureSeedEnv,
  type ConvexTestHandle,
  enableSeedApi,
  makeRateLimitedTest as makeTest,
  restoreSeedEnv,
} from '@tests/convex/convexTestHelpers'

const SEED_SECRET = 'test-seed-secret'
const USER_STATUS_ROUTE = '/api/seed/user-status'

const originalEnv = captureSeedEnv()

const restoreEnv = (): void =>
{
  restoreSeedEnv(originalEnv)
}

const seedHttpPost = async (
  t: ConvexTestHandle,
  body: Record<string, unknown>,
  secret: string | null = SEED_SECRET
): Promise<Response> =>
{
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (secret !== null)
  {
    headers.Authorization = `Bearer ${secret}`
  }
  return await t.fetch(USER_STATUS_ROUTE, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('seed route authorization gate', () =>
{
  beforeEach(() =>
  {
    delete process.env.CONVEX_SEED_ENABLED
    delete process.env.CONVEX_SEED_SECRET
  })
  afterEach(restoreEnv)

  it('rejects when seeding is disabled, locked, or the bearer token is wrong', async () =>
  {
    const t = makeTest()
    const body = { email: 'seed@example.com' }

    // enabled-flag is checked before the secret, so a valid-looking token
    // still fails closed while seeding is disabled
    const disabled = await seedHttpPost(t, body)
    expect(disabled.status).toBe(403)
    await expect(disabled.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is disabled'),
    })

    enableSeedApi(SEED_SECRET)
    const missing = await seedHttpPost(t, body, null)
    expect(missing.status).toBe(403)
    await expect(missing.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is locked'),
    })

    const wrong = await seedHttpPost(t, body, 'wrong-secret')
    expect(wrong.status).toBe(403)
    await expect(wrong.json()).resolves.toMatchObject({
      status: 'error',
      errorCode: CONVEX_ERROR_CODES.forbidden,
      errorMessage: expect.stringContaining('seeding is locked'),
    })
  })

  it('runs the gated query once the bearer token matches', async () =>
  {
    const t = makeTest()
    enableSeedApi(SEED_SECRET)

    const response = await seedHttpPost(t, { email: 'seed@example.com' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'success',
      value: { accountExists: false },
    })
  })
})
