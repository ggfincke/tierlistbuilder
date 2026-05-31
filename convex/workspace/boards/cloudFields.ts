// convex/workspace/boards/cloudFields.ts
// canonical board cloud-state field builders shared by board writers

import type { Doc } from '../../_generated/dataModel'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import { EMPTY_BOARD_LIBRARY_SUMMARY } from './librarySummary'
import {
  EMPTY_BOARD_SOURCE_RANKING,
  boardSourceTemplateFromTemplate,
} from './sourceFields'

export const buildFreshBoardCloudFields = (now: number) => ({
  livePublicTemplateId: null,
  livePublicRankingId: null,
  cloudState: 'cloudBacked' as const,
  cloudBackedAt: now,
  pausedReason: null,
})

// seed-provenance columns; null on every board created outside the seed
// pipeline (forks, from-scratch, consensus remixes) — spread into the insert
export const EMPTY_BOARD_SEED_FIELDS = {
  seedDatasetKey: null,
  seedReleaseId: null,
  seedExternalId: null,
  seedContentHash: null,
  seedKind: null,
  seedReleaseStatus: null,
} satisfies Pick<
  Doc<'boards'>,
  | 'seedDatasetKey'
  | 'seedReleaseId'
  | 'seedExternalId'
  | 'seedContentHash'
  | 'seedKind'
  | 'seedReleaseStatus'
>

type ForkedBoardInsert = Omit<
  Doc<'boards'>,
  | '_id'
  | '_creationTime'
  | 'externalId'
  | 'ownerId'
  | 'preferredCriterionExternalId'
>

export const buildForkedBoardInsert = (
  template: Doc<'templates'>,
  options: {
    title: string
    forkCounted: boolean
    now: number
    itemCount?: number
    progressCounts?: {
      activeItemCount: number
      unrankedItemCount: number
    }
    materializationState?: Doc<'boards'>['materializationState']
  }
): ForkedBoardInsert =>
{
  const itemCount = options.itemCount ?? template.itemCount
  const progressCounts = options.progressCounts ?? {
    activeItemCount: itemCount,
    unrankedItemCount: itemCount,
  }

  return {
    title: options.title,
    createdAt: options.now,
    updatedAt: options.now,
    deletedAt: null,
    revision: 0,
    sourceTemplate: boardSourceTemplateFromTemplate(template),
    sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
    forkCounted: options.forkCounted,
    ...buildFreshBoardCloudFields(options.now),
    materializationState: options.materializationState ?? 'ready',
    itemAspectRatio: template.itemAspectRatio ?? null,
    itemAspectRatioMode: template.itemAspectRatioMode ?? null,
    aspectRatioPromptDismissed: false,
    defaultItemImageFit: template.defaultItemImageFit ?? null,
    defaultItemImagePadding: template.defaultItemImagePadding ?? null,
    paletteId: null,
    textStyleId: null,
    pageBackground: null,
    labels: template.labels ?? null,
    autoPlate: template.autoPlate,
    ...progressCounts,
    templateProgressState: resolveTemplateProgressState(
      template._id,
      progressCounts
    ),
    librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
    ...EMPTY_BOARD_SEED_FIELDS,
  }
}
