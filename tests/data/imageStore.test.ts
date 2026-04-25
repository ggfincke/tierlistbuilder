// tests/data/imageStore.test.ts
// persistent image-store GC planning

import { describe, expect, it } from 'vitest'
import { resolveUnreferencedBlobHashes } from '~/shared/images/imageStore'

describe('imageStore GC planning', () =>
{
  it('keeps referenced blobs and unreferenced blobs inside the grace window', () =>
  {
    const now = 10_000
    const graceMs = 1_000

    const stale = resolveUnreferencedBlobHashes(
      [
        { hash: 'referenced-old', createdAt: 1_000 },
        { hash: 'unreferenced-old', createdAt: 1_000 },
        { hash: 'unreferenced-new', createdAt: 9_500 },
      ],
      ['referenced-old'],
      now,
      graceMs
    )

    expect(stale).toEqual(['unreferenced-old'])
  })
})
