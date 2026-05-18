// src/features/marketplace/model/analytics/useRecordTemplateView.ts
// fire recordTemplateView at most once per UTC day per slug — sessionStorage
// dedupes within a tab, a localStorage day gate dedupes across fresh tabs

import { useCallback } from 'react'

import { recordTemplateViewImperative } from '~/features/marketplace/data/templatesRepository'
import { useSessionDedupedAction } from '~/shared/hooks/useSessionDedupedAction'
import { logger } from '~/shared/lib/logger'

const TEMPLATE_VIEW_STORAGE_KEY = 'tlb:tpl-view'
const TEMPLATE_VIEW_DAILY_STORAGE_KEY = 'tlb:tpl-view-day'

export const useRecordTemplateView = (slug: string | null): void =>
{
  const onError = useCallback((error: unknown) =>
  {
    logger.warn('marketplace', 'recordTemplateView failed', error)
  }, [])

  useSessionDedupedAction({
    storageKey: TEMPLATE_VIEW_STORAGE_KEY,
    dailyStorageKey: TEMPLATE_VIEW_DAILY_STORAGE_KEY,
    value: slug,
    action: recordTemplateViewImperative,
    onError,
  })
}
