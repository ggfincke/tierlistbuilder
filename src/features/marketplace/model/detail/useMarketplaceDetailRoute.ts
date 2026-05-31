// src/features/marketplace/model/detail/useMarketplaceDetailRoute.ts
// shared slug-validation + loading-state wrapper for marketplace detail routes

import {
  isRankingSlug,
  type MarketplaceRankingDetail,
} from '@tierlistbuilder/contracts/marketplace/ranking'
import {
  isTemplateSlug,
  type MarketplaceTemplateDetail,
} from '@tierlistbuilder/contracts/marketplace/template'
import { useRankingBySlug } from '~/features/marketplace/model/detail/useRankingDetail'
import { useTemplateBySlug } from '~/features/marketplace/model/detail/useTemplateDetail'
import { useValidatedSlug } from '~/features/marketplace/model/detail/useValidatedSlug'

type MarketplaceDetailRouteState<TDetail> =
  | { status: 'missing' }
  | { status: 'loading' }
  | { status: 'ready'; detail: TDetail }

const resolveMarketplaceDetailRoute = <TSlug extends string, TDetail>(
  slug: TSlug | null,
  detail: TDetail | null | undefined
): MarketplaceDetailRouteState<TDetail> =>
{
  if (slug === null) return { status: 'missing' }
  if (detail === undefined) return { status: 'loading' }
  if (detail === null) return { status: 'missing' }
  return { status: 'ready', detail }
}

export const useTemplateDetailRoute =
  (): MarketplaceDetailRouteState<MarketplaceTemplateDetail> =>
  {
    const slug = useValidatedSlug(isTemplateSlug)
    const detail = useTemplateBySlug(slug)
    return resolveMarketplaceDetailRoute(slug, detail)
  }

export const useRankingDetailRoute =
  (): MarketplaceDetailRouteState<MarketplaceRankingDetail> =>
  {
    const slug = useValidatedSlug(isRankingSlug)
    const detail = useRankingBySlug(slug)
    return resolveMarketplaceDetailRoute(slug, detail)
  }
