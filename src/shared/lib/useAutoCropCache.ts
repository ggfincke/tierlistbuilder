// src/shared/lib/useAutoCropCache.ts
// React adapter for the auto-crop cache version — subscribes to invalidations
// w/o re-implementing useSyncExternalStore boilerplate at every consumer

import { useSyncExternalStore } from 'react'

import {
  getAutoCropCacheVersion,
  subscribeAutoCropCache,
} from '~/shared/lib/autoCrop'

export const useAutoCropCacheVersion = (): number =>
  useSyncExternalStore(
    subscribeAutoCropCache,
    getAutoCropCacheVersion,
    getAutoCropCacheVersion
  )
