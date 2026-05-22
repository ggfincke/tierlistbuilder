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

const SOURCE_TEMPLATE_FIELD_KEYS = [
  'sourceTemplateId',
  'sourceRankingId',
  'sourceTemplateTitle',
  'sourceRankingTitle',
  'preferredCriterionExternalId',
] as const satisfies readonly (keyof SourceTemplateFields)[]

// validation projection — pulls source-template fields from an untrusted
// wire/persisted object, coercing non-strings to undefined
export const normalizeSourceTemplateFields = (
  source: Record<string, unknown>
): SourceTemplateFields =>
{
  const fields: SourceTemplateFields = {}
  for (const key of SOURCE_TEMPLATE_FIELD_KEYS)
  {
    const value = source[key]
    if (typeof value === 'string')
    {
      fields[key] = value
    }
  }
  return fields
}
