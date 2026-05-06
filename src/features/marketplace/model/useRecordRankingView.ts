// src/features/marketplace/model/useRecordRankingView.ts
// fire recordRankingView once per browser session per slug, keyed in
// sessionStorage so reloads in the same tab are deduped & a fresh tab counts

import { useEffect } from 'react'

import { recordRankingViewImperative } from '~/features/marketplace/data/rankingsRepository'
import { logger } from '~/shared/lib/logger'

const RANKING_VIEW_STORAGE_KEY = 'tlb:rank-view'

const getRecordedSlugs = (): Set<string> =>
{
  if (typeof window === 'undefined') return new Set()
  try
  {
    const raw = window.sessionStorage.getItem(RANKING_VIEW_STORAGE_KEY)
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
      RANKING_VIEW_STORAGE_KEY,
      JSON.stringify([...slugs])
    )
  }
  catch
  {
    // session storage may be full or disabled; degraded counts beat hard fail
  }
}

export const useRecordRankingView = (slug: string | null): void =>
{
  useEffect(() =>
  {
    if (!slug) return
    const recorded = getRecordedSlugs()
    if (recorded.has(slug)) return
    recorded.add(slug)
    persistRecordedSlugs(recorded)

    void recordRankingViewImperative(slug).catch((error) =>
    {
      logger.warn('marketplace', 'recordRankingView failed', error)
    })
  }, [slug])
}
