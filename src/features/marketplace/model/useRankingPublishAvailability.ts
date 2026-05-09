// src/features/marketplace/model/useRankingPublishAvailability.ts
// model facade for ranking-publish availability checks

import { useRankingPublishAvailability as useRankingPublishAvailabilityQuery } from '~/features/marketplace/data/rankingsRepository'

export const useRankingPublishAvailability = (
  boardExternalId: string | null | undefined,
  criterionExternalId?: string | null,
  enabled = true
) =>
  useRankingPublishAvailabilityQuery(
    boardExternalId,
    criterionExternalId,
    enabled
  )
