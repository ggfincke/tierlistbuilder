// tests/shared-lib/asyncMapLimit.test.ts
// bounded async map helpers

import { describe, expect, it } from 'vitest'

import { mapAsyncLimit, mapAsyncLimitSettled } from '~/shared/lib/asyncMapLimit'

describe('mapAsyncLimit', () =>
{
  it('preserves input order under bounded concurrency', async () =>
  {
    const result = await mapAsyncLimit(
      [3, 1, 2],
      2,
      async (value) => value * 10
    )

    expect(result).toEqual([30, 10, 20])
  })
})

describe('mapAsyncLimitSettled', () =>
{
  it('collects success and failure results without rejecting', async () =>
  {
    const result = await mapAsyncLimitSettled([1, 2, 3], 2, async (value) =>
    {
      if (value === 2) throw new Error('nope')
      return value * 10
    })

    expect(result[0]).toEqual({ status: 'fulfilled', value: 10 })
    expect(result[1].status).toBe('rejected')
    expect(result[2]).toEqual({ status: 'fulfilled', value: 30 })
  })
})
