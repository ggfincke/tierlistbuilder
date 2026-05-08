// src/features/marketplace/model/useRecordRankingView.ts
// fire recordRankingView once per browser session per slug, keyed in
// sessionStorage so reloads in the same tab are deduped & a fresh tab counts

import { useCallback } from 'react'

import { recordRankingViewImperative } from '~/features/marketplace/data/rankingsRepository'
import { useSessionDedupedAction } from '~/shared/hooks/useSessionDedupedAction'
import { logger } from '~/shared/lib/logger'

const RANKING_VIEW_STORAGE_KEY = 'tlb:rank-view'

export const useRecordRankingView = (slug: string | null): void =>
{
  const onError = useCallback((error: unknown) =>
  {
    logger.warn('marketplace', 'recordRankingView failed', error)
  }, [])

  useSessionDedupedAction({
    storageKey: RANKING_VIEW_STORAGE_KEY,
    value: slug,
    action: recordRankingViewImperative,
    onError,
  })
}
