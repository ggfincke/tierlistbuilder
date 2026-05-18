// src/shared/board-data/sourceTemplateFields.ts
// helpers for the 5 source-template/ranking attribution fields on every
// BoardSnapshot — colocated so a new attribution field is a 1-site edit

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'

// shape of the source-attribution slice on a BoardSnapshot — every field is
// optional because pure local boards & community-template forks omit different
// subsets
type SourceTemplateFields = Pick<
  BoardSnapshot,
  | 'sourceTemplateId'
  | 'sourceRankingId'
  | 'sourceTemplateTitle'
  | 'sourceRankingTitle'
  | 'preferredCriterionExternalId'
>

// validation projection — pulls source-template fields from an untrusted
// wire/persisted object, coercing non-strings to undefined
export const normalizeSourceTemplateFields = (
  source: Record<string, unknown>
): SourceTemplateFields => ({
  sourceTemplateId:
    typeof source.sourceTemplateId === 'string'
      ? source.sourceTemplateId
      : undefined,
  sourceRankingId:
    typeof source.sourceRankingId === 'string'
      ? source.sourceRankingId
      : undefined,
  sourceTemplateTitle:
    typeof source.sourceTemplateTitle === 'string'
      ? source.sourceTemplateTitle
      : undefined,
  sourceRankingTitle:
    typeof source.sourceRankingTitle === 'string'
      ? source.sourceRankingTitle
      : undefined,
  preferredCriterionExternalId:
    typeof source.preferredCriterionExternalId === 'string'
      ? source.preferredCriterionExternalId
      : undefined,
})
