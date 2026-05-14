// tests/sharing/shortLinkShare.test.ts
// short-link fetch/decode abort behavior

import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  resolveShortLinkImperative: vi.fn(),
}))

vi.mock('~/features/platform/share/shortLinkRepository', () => ({
  resolveShortLinkImperative: repositoryMocks.resolveShortLinkImperative,
}))

import { MAX_SNAPSHOT_COMPRESSED_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import {
  ShortLinkDecodeError,
  decodeBoardFromShortLink,
  isShortLinkDecodeError,
} from '~/features/platform/share/shortLinkShare'

describe('short-link decode', () =>
{
  beforeEach(() =>
  {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects malformed short-link slugs before resolving', async () =>
  {
    await expect(decodeBoardFromShortLink('bad!')).rejects.toMatchObject({
      kind: 'invalid-slug',
    })
    expect(repositoryMocks.resolveShortLinkImperative).not.toHaveBeenCalled()
  })

  it('classifies missing short links separately from corrupt snapshots', async () =>
  {
    repositoryMocks.resolveShortLinkImperative.mockResolvedValue({
      kind: 'not-found',
    })

    await expect(decodeBoardFromShortLink('AbCd1234')).rejects.toMatchObject({
      kind: 'not-found',
    })
  })

  it('rejects oversized short-link blobs before reading the body', async () =>
  {
    repositoryMocks.resolveShortLinkImperative.mockResolvedValue({
      kind: 'snapshot',
      snapshotUrl: 'https://example.test/snapshot.bin',
      createdAt: 1,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, {
            headers: {
              'Content-Length': String(MAX_SNAPSHOT_COMPRESSED_BYTES + 1),
            },
            status: 200,
          })
      )
    )

    await expect(decodeBoardFromShortLink('AbCd1234')).rejects.toMatchObject({
      kind: 'too-large',
    })
  })

  it('classifies unreadable short-link snapshots as corrupt', async () =>
  {
    repositoryMocks.resolveShortLinkImperative.mockResolvedValue({
      kind: 'snapshot',
      snapshotUrl: 'https://example.test/snapshot.bin',
      createdAt: 1,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'Content-Length': '3' },
            status: 200,
          })
      )
    )

    await expect(decodeBoardFromShortLink('AbCd1234')).rejects.toMatchObject({
      kind: 'corrupt',
    })
  })

  it('exposes a type guard for short-link decode errors', () =>
  {
    const error = new ShortLinkDecodeError('not-found', 'missing')
    expect(isShortLinkDecodeError(error)).toBe(true)
    expect(isShortLinkDecodeError(new Error('missing'))).toBe(false)
  })

  it('stops after snapshot fetch when the caller aborts', async () =>
  {
    const controller = new AbortController()
    const abortReason = new Error('decode aborted')
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) =>
    {
      expect(init?.signal).toBe(controller.signal)
      controller.abort(abortReason)
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Length': '3' },
        status: 200,
      })
    })

    repositoryMocks.resolveShortLinkImperative.mockResolvedValue({
      kind: 'snapshot',
      snapshotUrl: 'https://example.test/snapshot.bin',
      createdAt: 1,
    })
    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      decodeBoardFromShortLink('AbCd1234', controller.signal)
    ).rejects.toThrow('decode aborted')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
