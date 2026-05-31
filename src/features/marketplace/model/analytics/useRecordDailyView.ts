// src/features/marketplace/model/analytics/useRecordDailyView.ts
// shared daily view-recorder hook for marketplace detail pages

import { useCallback } from 'react'

import { useSessionDedupedAction } from '~/shared/hooks/useSessionDedupedAction'
import { logger } from '~/shared/lib/logger'

interface RecordDailyViewOptions
{
  value: string | null
  storageKey: string
  dailyStorageKey: string
  action: (value: string) => Promise<unknown>
  logLabel: string
}

export const useRecordDailyView = ({
  value,
  storageKey,
  dailyStorageKey,
  action,
  logLabel,
}: RecordDailyViewOptions): void =>
{
  const onError = useCallback(
    (error: unknown) =>
    {
      logger.warn('marketplace', `${logLabel} failed`, error)
    },
    [logLabel]
  )

  useSessionDedupedAction({
    storageKey,
    dailyStorageKey,
    value,
    action,
    onError,
  })
}
