// src/features/marketplace/model/detail/useRankingDetail.ts
// model facade for ranking queries — keeps page/component .tsx files from
// importing data adapters directly per the slice boundary rule

export {
  useRankingBySlug,
  usePaginatedRankingsForTemplate,
  useMyRankingForTemplate,
  useTemplateRankingAggregate,
  useTemplateRankingAggregateItems,
} from '~/features/marketplace/data/rankingsRepository'
export type { TemplateRankingAggregateItemsPageStatus } from '~/features/marketplace/data/rankingsRepository'
