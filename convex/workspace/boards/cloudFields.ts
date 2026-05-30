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
    materializationState?: Doc<'boards'>['materializationState']
  }
): ForkedBoardInsert =>
{
  const itemCount = options.itemCount ?? template.itemCount
  const progressCounts = {
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
    seedDatasetKey: null,
    seedReleaseId: null,
    seedExternalId: null,
    seedContentHash: null,
    seedKind: null,
    seedReleaseStatus: null,
  }
}
