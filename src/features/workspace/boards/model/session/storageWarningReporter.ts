// src/features/workspace/boards/model/session/storageWarningReporter.ts
// rate-limited storage pressure warning for board snapshot saves

import {
  STORAGE_NEAR_FULL_MESSAGE,
  isStorageNearFull,
} from '~/features/workspace/boards/data/local/storageMetering'
import { toast } from '~/shared/notifications/useToastStore'

let storageWarningLastMs = 0
const STORAGE_WARNING_COOLDOWN_MS = 60_000

const shouldReport = (lastReportedMs: number): boolean =>
  lastReportedMs === 0 ||
  Date.now() - lastReportedMs > STORAGE_WARNING_COOLDOWN_MS

export const reportStorageWarningIfNeeded = (): void =>
{
  if (!shouldReport(storageWarningLastMs) || !isStorageNearFull())
  {
    return
  }

  storageWarningLastMs = Date.now()
  toast(STORAGE_NEAR_FULL_MESSAGE, 'error')
}
