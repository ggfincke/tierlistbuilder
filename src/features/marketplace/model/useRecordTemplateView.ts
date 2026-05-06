// src/features/marketplace/model/useRecordTemplateView.ts
// fire recordTemplateView once per browser session per slug, keyed in
// sessionStorage so reloads in the same tab are deduped & a fresh tab counts

import { useEffect } from 'react'

import { recordTemplateViewImperative } from '~/features/marketplace/data/templatesRepository'
import { logger } from '~/shared/lib/logger'

const TEMPLATE_VIEW_STORAGE_KEY = 'tlb:tpl-view'

const getRecordedSlugs = (): Set<string> =>
{
  if (typeof window === 'undefined') return new Set()
  try
  {
    const raw = window.sessionStorage.getItem(TEMPLATE_VIEW_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((entry) => typeof entry === 'string'))
  }
  catch
  {
    return new Set()
  }
}

const persistRecordedSlugs = (slugs: Set<string>): void =>
{
  if (typeof window === 'undefined') return
  try
  {
    window.sessionStorage.setItem(
      TEMPLATE_VIEW_STORAGE_KEY,
      JSON.stringify([...slugs])
    )
  }
  catch
  {
    // session storage may be full or disabled in some embed contexts;
    // dedup-degraded counts are preferable to a hard failure
  }
}

export const useRecordTemplateView = (slug: string | null): void =>
{
  useEffect(() =>
  {
    if (!slug) return
    const recorded = getRecordedSlugs()
    if (recorded.has(slug)) return
    recorded.add(slug)
    persistRecordedSlugs(recorded)

    void recordTemplateViewImperative(slug).catch((error) =>
    {
      logger.warn('marketplace', 'recordTemplateView failed', error)
    })
  }, [slug])
}
