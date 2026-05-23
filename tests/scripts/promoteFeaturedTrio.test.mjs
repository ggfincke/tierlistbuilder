// tests/scripts/promoteFeaturedTrio.test.mjs
// featured-trio script URL resolution and bearer transport coverage

import { describe, expect, it, vi } from 'vitest'
import {
  DATASET_KEY,
  FEATURED_EXTERNAL_IDS,
  FEATURED_TRIO_ROUTE,
  RELEASE_ID,
  normalizeConvexSiteUrl,
  postFeaturedTrio,
  resolveConvexSiteUrl,
} from '../../scripts/promote-featured-trio.mjs'

describe('promote featured trio script', () =>
{
  it('normalizes Convex client URLs to HTTP action site URLs', () =>
  {
    expect(normalizeConvexSiteUrl('https://example.convex.cloud')).toBe(
      'https://example.convex.site'
    )
    expect(normalizeConvexSiteUrl('http://127.0.0.1:3210')).toBe(
      'http://127.0.0.1:3211'
    )
    expect(normalizeConvexSiteUrl('http://localhost:3210/')).toBe(
      'http://localhost:3211'
    )
  })

  it('resolves shell env before dotenv and site URLs before client URLs', () =>
  {
    expect(
      resolveConvexSiteUrl({
        env: {
          CONVEX_URL: 'https://shell.convex.cloud',
        },
        dotenvEnv: {
          CONVEX_SITE_URL: 'https://dotenv.convex.site',
        },
      })
    ).toBe('https://shell.convex.site')

    expect(
      resolveConvexSiteUrl({
        env: {
          CONVEX_SITE_URL: 'https://site.convex.site',
          CONVEX_URL: 'https://client.convex.cloud',
        },
      })
    ).toBe('https://site.convex.site')
  })

  it('posts the seed secret only in the bearer header', async () =>
  {
    const seedSecret = 'super-secret'
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'success',
            value: {
              cleared: 0,
              promoted: [],
            },
          }),
          { status: 200 }
        )
    )

    await expect(
      postFeaturedTrio({
        siteUrl: 'https://example.convex.site',
        seedSecret,
        fetchImpl,
      })
    ).resolves.toEqual({ cleared: 0, promoted: [] })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, request] = fetchImpl.mock.calls[0]
    expect(url).toBe(`https://example.convex.site${FEATURED_TRIO_ROUTE}`)
    expect(request.headers.Authorization).toBe(`Bearer ${seedSecret}`)
    expect(request.headers['Content-Type']).toBe('application/json')
    expect(request.body).not.toContain(seedSecret)
    expect(JSON.parse(request.body)).toEqual({
      datasetKey: DATASET_KEY,
      releaseId: RELEASE_ID,
      externalIds: FEATURED_EXTERNAL_IDS,
    })
  })

  it('redacts the seed secret from failed HTTP response messages', async () =>
  {
    const seedSecret = 'super-secret'
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'error',
            errorMessage: `bad seed secret: ${seedSecret}`,
          }),
          { status: 403 }
        )
    )

    let error
    try
    {
      await postFeaturedTrio({
        siteUrl: 'https://example.convex.site/',
        seedSecret,
        fetchImpl,
      })
    }
    catch (caught)
    {
      error = caught
    }

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('[redacted-seed-secret]')
    expect(error.message).not.toContain(seedSecret)
    expect(fetchImpl.mock.calls[0][0]).toBe(
      `https://example.convex.site${FEATURED_TRIO_ROUTE}`
    )
  })
})
