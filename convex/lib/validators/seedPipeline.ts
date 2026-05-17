// convex/lib/validators/seedPipeline.ts
// seed-pipeline release, run, & diagnostics validators

import type { Infer } from 'convex/values'
import {
  SEED_RANKING_RELEASE_STATUSES,
  SEED_RUN_STATUSES,
  SEED_TEMPLATE_RELEASE_STATUSES,
  type SeedRankingReleaseStatus,
  type SeedRunStatus,
  type SeedTemplateReleaseStatus,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { type _Assert, type _Exact, literalUnion } from './common'

export const seedRunStatusValidator = literalUnion(SEED_RUN_STATUSES)
export const seedTemplateReleaseStatusValidator = literalUnion(
  SEED_TEMPLATE_RELEASE_STATUSES
)
export const seedRankingReleaseStatusValidator = literalUnion(
  SEED_RANKING_RELEASE_STATUSES
)

export type _SeedRunStatusExact = _Assert<
  _Exact<SeedRunStatus, Infer<typeof seedRunStatusValidator>>
>
export type _SeedTemplateReleaseStatusExact = _Assert<
  _Exact<
    SeedTemplateReleaseStatus,
    Infer<typeof seedTemplateReleaseStatusValidator>
  >
>
export type _SeedRankingReleaseStatusExact = _Assert<
  _Exact<
    SeedRankingReleaseStatus,
    Infer<typeof seedRankingReleaseStatusValidator>
  >
>
