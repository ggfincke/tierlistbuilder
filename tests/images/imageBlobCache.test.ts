// tests/images/imageBlobCache.test.ts
// image blob cache lifecycle & pruning behavior

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheFreshBlob,
  disposeImageBlobCache,
  getCachedImageUrl,
  handlePageHide,
  subscribeCachedImageUrl,
} from '~/shared/images/imageBlobCache'
import { mockObjectUrls } from '@tests/shared-lib/objectUrl'

let objectUrlId = 0
let objectUrls: ReturnType<typeof mockObjectUrls> | null = null

describe('imageBlobCache', () =>
{
  beforeEach(() =>
  {
    objectUrlId = 0
    objectUrls = mockObjectUrls(() => `blob:test-url-${++objectUrlId}`)
    disposeImageBlobCache()
  })

  afterEach(() =>
  {
    disposeImageBlobCache()
    objectUrls?.restore()
    objectUrls = null
  })

  it('does not clear cached urls on persisted pagehide events', () =>
  {
    cacheFreshBlob('hash-a', new Blob(['x'], { type: 'image/png' }))

    handlePageHide({ persisted: true })

    expect(getCachedImageUrl('hash-a')).toBe('blob:test-url-1')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('keeps subscribed urls when cache pruning removes older entries', () =>
  {
    let now = 0
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => ++now)
    const listener = vi.fn()

    try
    {
      cacheFreshBlob('hash-a', new Blob(['a'], { type: 'image/png' }))
      const unsubscribe = subscribeCachedImageUrl('hash-a', listener)

      try
      {
        for (let index = 0; index < 512; index++)
        {
          cacheFreshBlob(`hash-${index}`, new Blob(['x']))
        }
      }
      finally
      {
        unsubscribe()
      }
    }
    finally
    {
      dateNowSpy.mockRestore()
    }

    expect(getCachedImageUrl('hash-a')).toBe('blob:test-url-1')
    expect(getCachedImageUrl('hash-0')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url-2')
    expect(listener).not.toHaveBeenCalled()
  })
})
