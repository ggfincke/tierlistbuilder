// src/features/marketplace/model/useRecordTemplateView.ts
// fire recordTemplateView once per browser session per slug, keyed in
// sessionStorage so reloads in the same tab are deduped & a fresh tab counts

import { useCallback } from 'react'

import { recordTemplateViewImperative } from '~/features/marketplace/data/templatesRepository'
import { useSessionDedupedAction } from '~/shared/hooks/useSessionDedupedAction'
import { logger } from '~/shared/lib/logger'

const TEMPLATE_VIEW_STORAGE_KEY = 'tlb:tpl-view'

export const useRecordTemplateView = (slug: string | null): void =>
{
  const onError = useCallback((error: unknown) =>
  {
    logger.warn('marketplace', 'recordTemplateView failed', error)
  }, [])

  useSessionDedupedAction({
    storageKey: TEMPLATE_VIEW_STORAGE_KEY,
    value: slug,
    action: recordTemplateViewImperative,
    onError,
  })
}
