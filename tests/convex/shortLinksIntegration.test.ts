// tests/convex/shortLinksIntegration.test.ts
// Convex short-link listing query limit behavior

import { describe, expect, it } from 'vitest'
import { api } from '@convex/_generated/api'
import {
  DEFAULT_SHARE_LINK_TTL_MS,
  MAX_OWNED_SHORT_LINKS,
} from '@tierlistbuilder/contracts/platform/shortLink'
import { asUser, makeTest, seedUser } from './convexTestHelpers'

describe('short link Convex listing', () =>
{
  it('returns capped live rows even when newer expired rows exist', async () =>
  {
    const t = makeTest()
    const userId = await seedUser(t)
    const now = Date.now()

    await t.run(async (ctx) =>
    {
      const snapshotStorageId = await ctx.storage.store(
        new Blob([new Uint8Array([1])])
      )

      for (let i = 0; i < MAX_OWNED_SHORT_LINKS + 5; i++)
      {
        await ctx.db.insert('shortLinks', {
          slug: `expired-${i}`,
          ownerId: userId,
          snapshotStorageId,
          createdAt: now + i,
          expiresAt: now - 1 - i,
          boardTitle: `Expired ${i}`,
        })
      }

      for (let i = 0; i < MAX_OWNED_SHORT_LINKS + 2; i++)
      {
        await ctx.db.insert('shortLinks', {
          slug: `live-${i}`,
          ownerId: userId,
          snapshotStorageId,
          createdAt: now - i,
          expiresAt: now + DEFAULT_SHARE_LINK_TTL_MS - i,
          boardTitle: `Live ${i}`,
        })
      }
    })

    const result = await asUser(t, userId).query(
      api.platform.shortLinks.queries.getMyShortLinks,
      {}
    )

    expect(result).toHaveLength(MAX_OWNED_SHORT_LINKS)
    expect(result[0]).toMatchObject({ slug: 'live-0', boardTitle: 'Live 0' })
    expect(result.every((row) => row.slug.startsWith('live-'))).toBe(true)
  })
})
