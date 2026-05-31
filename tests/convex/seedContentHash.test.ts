// tests/convex/seedContentHash.test.ts
// golden vectors for Convex seed content hashing

import { describe, expect, it } from 'vitest'
import { seedContentHash } from '../../convex/lib/seedContentHash'

describe('seedContentHash', () =>
{
  it('matches the Python seed content-hash golden vectors', async () =>
  {
    await expect(
      seedContentHash('template-metadata', {
        title: 'A',
        tags: ['x', 'y'],
        description: null,
      })
    ).resolves.toBe('v1:bf0740600563e78d22c1e56ede65fd5d')

    await expect(
      seedContentHash('unicode', { z: 'é', a: { drop: null, keep: 1 } })
    ).resolves.toBe('v1:26af77010001185ffee1a14740f92a6a')
  })
})
