// tests/shared-lib/objectUrl.ts
// URL object-url mocks for image cache/upload-adjacent tests

import { vi } from 'vitest'

type UrlObjectMethod = 'createObjectURL' | 'revokeObjectURL'

type MockObjectUrls = {
  restore: () => void
}

const restoreUrlMethod = (
  key: UrlObjectMethod,
  descriptor: PropertyDescriptor | undefined
): void =>
{
  if (descriptor)
  {
    Object.defineProperty(URL, key, descriptor)
    return
  }

  delete (URL as typeof URL & Partial<Record<UrlObjectMethod, unknown>>)[key]
}

export const mockObjectUrls = (
  nextObjectUrl: string | (() => string)
): MockObjectUrls =>
{
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
    URL,
    'createObjectURL'
  )
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
    URL,
    'revokeObjectURL'
  )

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() =>
      typeof nextObjectUrl === 'function' ? nextObjectUrl() : nextObjectUrl
    ),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })

  return {
    restore: () =>
    {
      restoreUrlMethod('createObjectURL', originalCreateObjectUrl)
      restoreUrlMethod('revokeObjectURL', originalRevokeObjectUrl)
    },
  }
}
