// src/features/platform/sync/orchestration/useSyncEpoch.ts
// auth-epoch tracker: increments on user-id changes & returns a stable shouldProceed guard

import { useState } from 'react'
import { CLOUD_SYNC_ENABLED } from '../lib/cloudSyncConfig'

export interface SyncEpoch
{
  authEpoch: number
  capturedUserId: string
  shouldProceed: () => boolean
}

interface EpochSlot
{
  userId: string | null
  snapshot: SyncEpoch | null
}

// module-scoped monotonic counter & active-user tracker. shouldProceed
// closures compare captured values to these live globals to detect sign-out
// or user switch mid-flight (single-user SPA assumption)
let moduleAuthEpoch = 0
let moduleCurrentUserId: string | null = null

// tracks the active userId & monotonic auth epoch so shouldProceed closures
// can detect sign-out/user-switch mid-flight. returns null when sync is
// disabled or no user is signed in
export const useSyncEpoch = (userId: string | null): SyncEpoch | null =>
{
  const [slot, setSlot] = useState<EpochSlot>({ userId: null, snapshot: null })

  const active = userId && CLOUD_SYNC_ENABLED ? userId : null

  if (slot.userId !== active)
  {
    if (!active)
    {
      moduleCurrentUserId = null
      setSlot({ userId: null, snapshot: null })
      return null
    }

    moduleAuthEpoch++
    moduleCurrentUserId = active
    const authEpoch = moduleAuthEpoch
    const capturedUserId = active
    const shouldProceed = (): boolean =>
      moduleAuthEpoch === authEpoch && moduleCurrentUserId === capturedUserId
    const snapshot: SyncEpoch = { authEpoch, capturedUserId, shouldProceed }
    setSlot({ userId: active, snapshot })
    return snapshot
  }

  return slot.snapshot
}
