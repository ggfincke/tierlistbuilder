// src/features/marketplace/model/analytics/useRecordTemplateView.ts
// record template views once per UTC day per slug

import { recordTemplateViewImperative } from '~/features/marketplace/data/templatesRepository'
import { useRecordDailyView } from '~/features/marketplace/model/analytics/useRecordDailyView'

const TEMPLATE_VIEW_STORAGE_KEY = 'tlb:tpl-view'
const TEMPLATE_VIEW_DAILY_STORAGE_KEY = 'tlb:tpl-view-day'

export const useRecordTemplateView = (slug: string | null): void =>
{
  useRecordDailyView({
    storageKey: TEMPLATE_VIEW_STORAGE_KEY,
    dailyStorageKey: TEMPLATE_VIEW_DAILY_STORAGE_KEY,
    value: slug,
    action: recordTemplateViewImperative,
    logLabel: 'recordTemplateView',
  })
}
