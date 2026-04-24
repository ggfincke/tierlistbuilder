// src/features/workspace/boards/model/session/storageWarningReporter.ts
// rate-limited storage pressure warning for board snapshot saves

import {
  STORAGE_NEAR_FULL_MESSAGE,
  isStorageNearFull,
} from '~/shared/lib/storageMetering'
import { toast } from '~/shared/notifications/useToastStore'

let storageWarningLastMs = 0
const STORAGE_WARNING_COOLDOWN_MS = 60_000

export const reportStorageWarningIfNeeded = (): void =>
{
  const now = Date.now()
  if (
    now - storageWarningLastMs <= STORAGE_WARNING_COOLDOWN_MS ||
    !isStorageNearFull()
  )
  {
    return
  }

  storageWarningLastMs = now
  toast(STORAGE_NEAR_FULL_MESSAGE, 'error')
}
