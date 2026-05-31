// src/features/marketplace/model/analytics/useRecordRankingView.ts
// record ranking views once per UTC day per slug

import { recordRankingViewImperative } from '~/features/marketplace/data/rankingsRepository'
import { useRecordDailyView } from '~/features/marketplace/model/analytics/useRecordDailyView'

const RANKING_VIEW_STORAGE_KEY = 'tlb:rank-view'
const RANKING_VIEW_DAILY_STORAGE_KEY = 'tlb:rank-view-day'

export const useRecordRankingView = (slug: string | null): void =>
{
  useRecordDailyView({
    storageKey: RANKING_VIEW_STORAGE_KEY,
    dailyStorageKey: RANKING_VIEW_DAILY_STORAGE_KEY,
    value: slug,
    action: recordRankingViewImperative,
    logLabel: 'recordRankingView',
  })
}
