// convex/marketplace/seedPipeline/types.ts
// shared TS types for seed-pipeline modules

import type { Doc, Id } from '../../_generated/dataModel'
import type {
  MediaVariantKind,
  SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'
import type {
  SeedCriterionUpsert,
  SeedItemUpsert,
  SeedResolvedCriterion,
  SeedResolvedItem,
  SeedResolvedMedia,
  SeedTemplateReleaseStatus,
  SeedTemplateUpsert,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'

export type SeedRemovalCandidate = {
  templateExternalId: string
  itemExternalId?: string
  criterionExternalId?: string
  action: 'absentFromRelease'
}

export type SeedResolvedTemplateRow = {
  externalId: string
  releaseId: string | null
  title: string
  description: string | null
  category: Doc<'templates'>['category']
  tags: string[]
  visibility: Doc<'templates'>['visibility']
  status: SeedTemplateReleaseStatus | null
  itemAspectRatio: number | null
}

export type SeedResolveStateResult = {
  activeReleaseId: string | null
  templates: SeedResolvedTemplateRow[]
  items: SeedResolvedItem[]
  criteria: SeedResolvedCriterion[]
  media: SeedResolvedMedia[]
  absentFromManifest: SeedRemovalCandidate[]
}

export type SeedUploadVariantKind = Extract<
  MediaVariantKind,
  'tile' | 'preview'
>

export type SeedUploadedVariantArg = {
  contentHash: string
  storageId: Id<'_storage'>
  kind: SeedUploadVariantKind
  expectedMimeType: SupportedImageMimeType
  expectedByteSize: number
  expectedWidth: number
  expectedHeight: number
}

export type SeedUploadedMediaAssetArg = {
  assetKey: string
  variants: SeedUploadedVariantArg[]
}

export type VerifiedSeedVariant = {
  kind: SeedUploadVariantKind
  storageId: Id<'_storage'>
  contentHash: string
  mimeType: SupportedImageMimeType
  width: number
  height: number
  byteSize: number
}

export type SeedUploadUrlRow = {
  contentHash: string
  uploadUrl: string
  expiresAt: number
}

export type SeedStorageCleanupCounts = {
  cleanedStorageIds: string[]
  missingStorageIds: string[]
}

export type SeedCleanupResult = SeedStorageCleanupCounts & {
  skippedStorageIds: string[]
}

export type SeedRegisterUploadsResult = {
  registeredStorageIds: string[]
}

export type SeedFinalizedMediaRow = {
  assetKey: string
  contentHashes: string[]
  mediaAssetId: string
  reused: boolean
}

export type SeedTemplateUpsertArg = SeedTemplateUpsert & {
  suggestedTiers: Doc<'templates'>['suggestedTiers']
}

export type SeedItemUpsertArg = SeedItemUpsert & {
  transform: Doc<'templateItems'>['transform']
}

export type SeedCriterionUpsertArg = SeedCriterionUpsert

export type SeedTemplateApplyPatch = Pick<
  Doc<'templates'>,
  | 'title'
  | 'description'
  | 'category'
  | 'tags'
  | 'visibility'
  | 'coverMediaAssetId'
  | 'coverFraming'
  | 'suggestedTiers'
  | 'itemAspectRatio'
  | 'itemAspectRatioMode'
  | 'defaultItemImageFit'
  | 'itemCount'
  | 'sizeClass'
  | 'publicationState'
  | 'isPubliclyListable'
  | 'seedDatasetKey'
  | 'seedExternalId'
  | 'seedReleaseId'
  | 'seedReleaseStatus'
>

export type SeedDiagnosticRow = {
  code: string
  message: string
  path: string
  severity: 'warning' | 'error'
}
