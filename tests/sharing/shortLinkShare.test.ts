// tests/sharing/shortLinkShare.test.ts
// short-link fetch/decode abort behavior

import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  resolveShortLinkImperative: vi.fn(),
  generateSnapshotUploadUrlImperative: vi.fn(),
  createSnapshotShortLinkImperative: vi.fn(),
}))

vi.mock('~/features/platform/share/shortLinkRepository', () => ({
  resolveShortLinkImperative: repositoryMocks.resolveShortLinkImperative,
  generateSnapshotUploadUrlImperative:
    repositoryMocks.generateSnapshotUploadUrlImperative,
  createSnapshotShortLinkImperative:
    repositoryMocks.createSnapshotShortLinkImperative,
}))

import { decodeBoardFromShortLink } from '~/features/platform/share/shortLinkShare'

describe('short-link decode', () =>
{
  beforeEach(() =>
  {
    vi.resetAllMocks()
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
