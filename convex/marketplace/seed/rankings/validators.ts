// convex/marketplace/seed/rankings/validators.ts
// validators for seed-gated ranking manifests & reports

import { v, type Infer } from 'convex/values'
import {
  tierPresetTierValidator,
  type _Assert,
  type _Exact,
} from '../../../lib/validators/common'
import { rankingFeaturedBadgeValidator } from '../../../lib/validators/marketplace'
import { seedRankingReleaseStatusValidator } from '../../../lib/validators/seedPipeline'
import { seedDiagnosticValidator } from '../lib/validators'
import type {
  SeedCuratedRanking as SeedCuratedRankingContract,
  SeedRankingLane as SeedRankingLaneContract,
  SeedRankingProfile as SeedRankingProfileContract,
  SeedRankingsManifest as SeedRankingsManifestContract,
  SeedRankingTarget as SeedRankingTargetContract,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'

export const seedRankingTermOverridesValidator = v.record(
  v.string(),
  v.array(v.string())
)

export const seedRankingProfileValidator = v.object({
  key: v.string(),
  displayName: v.string(),
  chaos: v.number(),
  contrarian: v.number(),
  boostTermsByTarget: seedRankingTermOverridesValidator,
  dropTermsByTarget: seedRankingTermOverridesValidator,
})

export const seedRankingFeaturedProfileValidator = v.object({
  profileKey: v.string(),
  featuredRank: v.number(),
  featuredBadge: rankingFeaturedBadgeValidator,
})

export const seedRankingLaneValidator = v.object({
  criterionExternalId: v.string(),
  titleSuffix: v.string(),
  description: v.string(),
  boostTerms: v.array(v.string()),
  dropTerms: v.array(v.string()),
  profileBoostOverrides: seedRankingTermOverridesValidator,
  profileDropOverrides: seedRankingTermOverridesValidator,
  chaosMultiplier: v.number(),
  contrarianMultiplier: v.number(),
  featuredProfiles: v.array(seedRankingFeaturedProfileValidator),
})

export const seedCuratedTierGroupValidator = v.object({
  tierName: v.string(),
  labels: v.array(v.string()),
})

export const seedCuratedRankingValidator = v.object({
  externalId: v.string(),
  authorKey: v.string(),
  authorDisplayName: v.string(),
  criterionExternalId: v.string(),
  title: v.string(),
  description: v.string(),
  featuredRank: v.union(v.number(), v.null()),
  featuredBadge: v.union(rankingFeaturedBadgeValidator, v.null()),
  coverage: v.union(
    v.literal('full-template'),
    v.literal('partial-authoritative')
  ),
  parentLabelByLabel: v.record(v.string(), v.string()),
  tiers: v.array(tierPresetTierValidator),
  tierGroups: v.array(seedCuratedTierGroupValidator),
})

export const seedRankingTargetValidator = v.object({
  templateExternalId: v.string(),
  sampleProfileCount: v.number(),
  countAsTemplateUse: v.boolean(),
  lanes: v.array(seedRankingLaneValidator),
  curatedRankings: v.array(seedCuratedRankingValidator),
})

// mirrors SeedRankingsManifest + compiled-manifest.schema.json rankingSeeds
export const seedRankingsManifestValidator = v.object({
  profileSet: v.string(),
  defaultProfileCount: v.number(),
  includeAllTemplates: v.boolean(),
  profiles: v.array(seedRankingProfileValidator),
  targets: v.array(seedRankingTargetValidator),
})

export const seedRankingLaneSummaryValidator = v.object({
  templateExternalId: v.string(),
  criterionExternalId: v.string(),
  sampleRankings: v.number(),
  curatedRankings: v.number(),
})

export const seedRankingPreflightResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  profileCount: v.number(),
  authorCount: v.number(),
  targetCount: v.number(),
  sampleRankingsPlanned: v.number(),
  curatedRankingsPlanned: v.number(),
  existingSeedRankings: v.number(),
  existingActiveSeedRankings: v.number(),
  aggregateLanes: v.array(seedRankingLaneSummaryValidator),
  diagnostics: v.array(seedDiagnosticValidator),
})

export const seedRankingApplyChunkResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  boardsReplaced: v.number(),
  rankingsReplaced: v.number(),
  rankingsUnchanged: v.number(),
  sampleRankingsApplied: v.number(),
  curatedRankingsApplied: v.number(),
  rankingTiersWritten: v.number(),
  rankingItemsWritten: v.number(),
  aggregateLanes: v.array(seedRankingLaneSummaryValidator),
})

export const seedRankingAuthorEnsureResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  authorsCreated: v.number(),
  authorsReused: v.number(),
  authorsPatched: v.number(),
  diagnostics: v.array(seedDiagnosticValidator),
})

export const seedRankingActivationResultValidator = v.object({
  datasetKey: v.string(),
  releaseId: v.string(),
  activatedRankings: v.number(),
  rolledBackRankings: v.number(),
  aggregateJobsQueued: v.number(),
})

export const seedRankingReleaseStatusArgValidator = v.union(
  seedRankingReleaseStatusValidator,
  v.null()
)

export type SeedRankingsManifest = Infer<typeof seedRankingsManifestValidator>
export type SeedRankingProfile = Infer<typeof seedRankingProfileValidator>
export type SeedRankingTarget = Infer<typeof seedRankingTargetValidator>
export type SeedRankingLane = Infer<typeof seedRankingLaneValidator>
export type SeedCuratedRanking = Infer<typeof seedCuratedRankingValidator>

export type _SeedRankingsManifestMatchesContract = _Assert<
  _Exact<SeedRankingsManifestContract, SeedRankingsManifest>
>
export type _SeedRankingProfileMatchesContract = _Assert<
  _Exact<SeedRankingProfileContract, SeedRankingProfile>
>
export type _SeedRankingTargetMatchesContract = _Assert<
  _Exact<SeedRankingTargetContract, SeedRankingTarget>
>
export type _SeedRankingLaneMatchesContract = _Assert<
  _Exact<SeedRankingLaneContract, SeedRankingLane>
>
export type _SeedCuratedRankingMatchesContract = _Assert<
  _Exact<SeedCuratedRankingContract, SeedCuratedRanking>
>
export type SeedRankingLaneSummary = Infer<
  typeof seedRankingLaneSummaryValidator
>
export type SeedRankingApplyChunkResult = Infer<
  typeof seedRankingApplyChunkResultValidator
>
export type SeedRankingAuthorEnsureResult = Infer<
  typeof seedRankingAuthorEnsureResultValidator
>
export type SeedRankingPreflightResult = Infer<
  typeof seedRankingPreflightResultValidator
>
export type SeedRankingActivationResult = Infer<
  typeof seedRankingActivationResultValidator
>
