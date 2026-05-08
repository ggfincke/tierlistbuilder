// packages/contracts/marketplace/templateCriterion.ts
// public template criterion contracts shared by marketplace templates & rankings

export const TEMPLATE_CRITERION_STATUSES = [
  'active',
  'hidden',
  'deprecated',
] as const

export type TemplateCriterionStatus =
  (typeof TEMPLATE_CRITERION_STATUSES)[number]

export interface MarketplaceTemplateCriterion
{
  externalId: string
  name: string
  shortName: string | null
  prompt: string
  axisTop: string | null
  axisBottom: string | null
  order: number
  isPrimary: boolean
  status: TemplateCriterionStatus
}

export interface MarketplaceTemplateCriterionSnapshot
{
  externalId: string
  name: string
  prompt: string
}

export const DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID = 'default'
export const DEFAULT_TEMPLATE_CRITERION_NAME = 'Overall'
export const DEFAULT_TEMPLATE_CRITERION_PROMPT =
  'Rank these items using the template prompt.'

export const MAX_TEMPLATE_CRITERIA = 8
export const MAX_TEMPLATE_CRITERION_ID_LENGTH = 40
export const MAX_TEMPLATE_CRITERION_NAME_LENGTH = 40
export const MAX_TEMPLATE_CRITERION_SHORT_NAME_LENGTH = 16
export const MAX_TEMPLATE_CRITERION_PROMPT_LENGTH = 160
export const MAX_TEMPLATE_CRITERION_AXIS_LABEL_LENGTH = 40

export const TEMPLATE_CRITERION_EXTERNAL_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/
