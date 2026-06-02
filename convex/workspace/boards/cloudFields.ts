// convex/workspace/boards/cloudFields.ts
// canonical board cloud-state field builders shared by board writers

import type { Doc } from '../../_generated/dataModel'
import { resolveTemplateProgressState } from '../../lib/templateProgress'
import { EMPTY_BOARD_LIBRARY_SUMMARY } from './librarySummary'
import {
  EMPTY_BOARD_SOURCE_RANKING,
  boardSourceTemplateFromTemplate,
} from './sourceFields'
import { renderFieldsFromTemplate } from '../../lib/templates/renderFields'

type CloudBoardDefaults = Pick<
  Doc<'boards'>,
  | 'livePublicTemplateId'
  | 'livePublicRankingId'
  | 'cloudState'
  | 'cloudBackedAt'
  | 'pausedReason'
  | 'seedDatasetKey'
  | 'seedReleaseId'
  | 'seedExternalId'
  | 'seedContentHash'
  | 'seedKind'
  | 'seedReleaseStatus'
>

export const buildCloudBoardDefaults = (now: number): CloudBoardDefaults => ({
  livePublicTemplateId: null,
  livePublicRankingId: null,
  cloudState: 'cloudBacked' as const,
  cloudBackedAt: now,
  pausedReason: null,
  seedDatasetKey: null,
  seedReleaseId: null,
  seedExternalId: null,
  seedContentHash: null,
  seedKind: null,
  seedReleaseStatus: null,
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
    progressCounts?: {
      activeItemCount: number
      unrankedItemCount: number
    }
    materializationState?: Doc<'boards'>['materializationState']
    // active image style externalId; null/absent -> template default style
    imageStyleId?: string | null
    // when a non-default style is forked, its render defaults override the
    // template's so the board frames the skin's art correctly
    style?: Doc<'templateStyles'> | null
  }
): ForkedBoardInsert =>
{
  const itemCount = options.itemCount ?? template.itemCount
  const progressCounts = options.progressCounts ?? {
    activeItemCount: itemCount,
    unrankedItemCount: itemCount,
  }
  // a non-default style supplies its own framing defaults; default style forks
  // inherit the template's
  const renderSource = options.style ?? template

  return {
    title: options.title,
    createdAt: options.now,
    updatedAt: options.now,
    deletedAt: null,
    revision: 0,
    sourceTemplate: boardSourceTemplateFromTemplate(template),
    sourceRanking: EMPTY_BOARD_SOURCE_RANKING,
    forkCounted: options.forkCounted,
    ...buildCloudBoardDefaults(options.now),
    materializationState: options.materializationState ?? 'ready',
    imageStyleId: options.imageStyleId ?? null,
    ...renderFieldsFromTemplate(renderSource),
    aspectRatioPromptDismissed: false,
    paletteId: null,
    textStyleId: null,
    pageBackground: null,
    ...progressCounts,
    templateProgressState: resolveTemplateProgressState(
      template._id,
      progressCounts
    ),
    librarySummary: EMPTY_BOARD_LIBRARY_SUMMARY,
  }
}
