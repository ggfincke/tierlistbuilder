// src/features/marketplace/model/useRankingPublishAvailability.ts
// model facade for ranking-publish availability checks

import { useRankingPublishAvailability as useRankingPublishAvailabilityQuery } from '~/features/marketplace/data/rankingsRepository'

export const useRankingPublishAvailability = (
  boardExternalId: string | null | undefined,
  enabled = true
) => useRankingPublishAvailabilityQuery(boardExternalId, enabled)
