// src/features/marketplace/model/useRankingDetail.ts
// model facade for ranking queries — keeps page/component .tsx files from
// importing data adapters directly per the slice boundary rule

export {
  useRankingBySlug,
  useRankingsForTemplate,
  useMyRankings,
} from '~/features/marketplace/data/rankingsRepository'
