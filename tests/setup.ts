// tests/setup.ts
// global vitest setup — stub localStorage w/ an in-memory backing store &
// reset mock call history before each test so suites share no hidden state

import { afterEach, beforeEach, vi } from 'vitest'
import { createMemoryStorage } from './shared-lib/memoryStorage'

beforeEach(() =>
{
  vi.stubGlobal('localStorage', createMemoryStorage())
  vi.resetAllMocks()
})

afterEach(() =>
{
  vi.unstubAllGlobals()
})
