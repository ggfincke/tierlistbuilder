// src/features/marketplace/model/useRecordRankingView.ts
// fire recordRankingView at most once per UTC day per slug — sessionStorage
// dedupes within a tab, a localStorage day gate dedupes across fresh tabs

import { useCallback } from 'react'

import { recordRankingViewImperative } from '~/features/marketplace/data/rankingsRepository'
import { useSessionDedupedAction } from '~/shared/hooks/useSessionDedupedAction'
import { logger } from '~/shared/lib/logger'

const RANKING_VIEW_STORAGE_KEY = 'tlb:rank-view'
const RANKING_VIEW_DAILY_STORAGE_KEY = 'tlb:rank-view-day'

export const useRecordRankingView = (slug: string | null): void =>
{
  const onError = useCallback((error: unknown) =>
  {
    logger.warn('marketplace', 'recordRankingView failed', error)
  }, [])

  useSessionDedupedAction({
    storageKey: RANKING_VIEW_STORAGE_KEY,
    dailyStorageKey: RANKING_VIEW_DAILY_STORAGE_KEY,
    value: slug,
    action: recordRankingViewImperative,
    onError,
  })
}
