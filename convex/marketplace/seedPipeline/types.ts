// convex/marketplace/seedPipeline/types.ts
// shared TS types for seed-pipeline modules

import type { Doc, Id } from '../../_generated/dataModel'
import type {
  SeedCleanupOutput,
  SeedCriterionUpsert,
  SeedDiagnostic,
  SeedFinalizedMedia,
  SeedItemUpsert,
  SeedResolvedTemplate,
  SeedRegisterUploadedStorageIdsOutput,
  SeedResolveStateOutput,
  SeedTemplateUpsert,
  SeedUploadedMediaAsset,
  SeedUploadedVariant,
} from '@tierlistbuilder/contracts/marketplace/seedPipeline'

export type SeedResolvedTemplateRow = SeedResolvedTemplate

export type SeedResolveStateResult = SeedResolveStateOutput

export type SeedUploadVariantKind = SeedUploadedVariant['kind']

export type SeedUploadedVariantArg = Omit<SeedUploadedVariant, 'storageId'> & {
  storageId: Id<'_storage'>
}

export type SeedUploadedMediaAssetArg = Omit<
  SeedUploadedMediaAsset,
  'variants'
> & {
  variants: SeedUploadedVariantArg[]
}

export type VerifiedSeedVariant = {
  kind: SeedUploadVariantKind
  storageId: Id<'_storage'>
  contentHash: string
  mimeType: SeedUploadedVariant['expectedMimeType']
  width: number
  height: number
  byteSize: number
}

export type SeedStorageCleanupCounts = Pick<
  SeedCleanupOutput,
  'cleanedStorageIds' | 'missingStorageIds'
>

export type SeedCleanupResult = SeedCleanupOutput

export type SeedRegisterUploadsResult = SeedRegisterUploadedStorageIdsOutput

export type SeedFinalizedMediaRow = SeedFinalizedMedia

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
  | 'defaultItemImagePadding'
  | 'itemCount'
  | 'labels'
  | 'autoPlate'
  | 'sizeClass'
  | 'publicationState'
  | 'isPubliclyListable'
  | 'seedDatasetKey'
  | 'seedExternalId'
  | 'seedReleaseId'
  | 'seedReleaseStatus'
  | 'seedMetadataContentHash'
>

export type SeedDiagnosticRow = SeedDiagnostic
