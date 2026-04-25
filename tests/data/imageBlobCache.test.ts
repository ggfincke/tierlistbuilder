// tests/data/imageBlobCache.test.ts
// image blob cache pagehide behavior

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheFreshBlob,
  disposeImageBlobCache,
  getCachedImageUrl,
  handlePageHide,
} from '~/shared/images/imageBlobCache'

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL'
)
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL'
)

const restoreUrlMethod = (
  key: 'createObjectURL' | 'revokeObjectURL',
  descriptor: PropertyDescriptor | undefined
): void =>
{
  if (descriptor)
  {
    Object.defineProperty(URL, key, descriptor)
    return
  }

  delete (URL as typeof URL & Partial<Record<typeof key, unknown>>)[key]
}

describe('imageBlobCache', () =>
{
  beforeEach(() =>
  {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:test-url'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    })
    disposeImageBlobCache()
  })

  afterEach(() =>
  {
    disposeImageBlobCache()
    restoreUrlMethod('createObjectURL', originalCreateObjectUrl)
    restoreUrlMethod('revokeObjectURL', originalRevokeObjectUrl)
  })

  it('does not clear cached urls on persisted pagehide events', () =>
  {
    cacheFreshBlob('hash-a', new Blob(['x'], { type: 'image/png' }))

    handlePageHide({ persisted: true })

    expect(getCachedImageUrl('hash-a')).toBe('blob:test-url')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})
