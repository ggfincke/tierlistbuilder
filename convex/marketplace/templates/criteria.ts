// convex/marketplace/templates/criteria.ts
// semantic helpers for curated template ranking criteria

import type {
  MarketplaceTemplateCriterion,
  MarketplaceTemplateCriterionSnapshot,
  TemplateCriterionStatus,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
  DEFAULT_TEMPLATE_CRITERION_NAME,
  DEFAULT_TEMPLATE_CRITERION_PROMPT,
  MAX_TEMPLATE_CRITERIA,
  MAX_TEMPLATE_CRITERION_AXIS_LABEL_LENGTH,
  MAX_TEMPLATE_CRITERION_ID_LENGTH,
  MAX_TEMPLATE_CRITERION_NAME_LENGTH,
  MAX_TEMPLATE_CRITERION_PROMPT_LENGTH,
  MAX_TEMPLATE_CRITERION_SHORT_NAME_LENGTH,
  TEMPLATE_CRITERION_EXTERNAL_ID_PATTERN,
  TEMPLATE_CRITERION_STATUSES,
} from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  failInput,
  normalizeNullableText,
  normalizeRequiredText,
} from '../../lib/text'

export type TemplateCriteriaSource = {
  [key: string]: unknown
  criteria?: readonly MarketplaceTemplateCriterion[] | null
}

const TEMPLATE_CRITERION_STATUS_SET: ReadonlySet<TemplateCriterionStatus> =
  new Set(TEMPLATE_CRITERION_STATUSES)

export const buildDefaultTemplateCriterion =
  (): MarketplaceTemplateCriterion => ({
    externalId: DEFAULT_TEMPLATE_CRITERION_EXTERNAL_ID,
    name: DEFAULT_TEMPLATE_CRITERION_NAME,
    shortName: null,
    prompt: DEFAULT_TEMPLATE_CRITERION_PROMPT,
    axisTop: null,
    axisBottom: null,
    order: 0,
    isPrimary: true,
    status: 'active',
  })

export const buildDefaultTemplateCriteria =
  (): MarketplaceTemplateCriterion[] => [buildDefaultTemplateCriterion()]

export const normalizeTemplateCriterionExternalId = (raw: string): string =>
  raw.trim().toLowerCase()

const validateCriterionExternalId = (raw: string): string =>
{
  const externalId = normalizeTemplateCriterionExternalId(raw)
  if (!externalId)
  {
    failInput('template criterion externalId is required')
  }
  if (externalId.length > MAX_TEMPLATE_CRITERION_ID_LENGTH)
  {
    failInput(
      `template criterion externalId must be at most ${MAX_TEMPLATE_CRITERION_ID_LENGTH} characters`
    )
  }
  if (!TEMPLATE_CRITERION_EXTERNAL_ID_PATTERN.test(externalId))
  {
    failInput('template criterion externalId must use lowercase kebab-case')
  }
  return externalId
}

const validateCriterionOrder = (order: number): number =>
{
  if (!Number.isSafeInteger(order))
  {
    failInput('template criterion order must be an integer')
  }
  return order
}

const validateCriterionStatus = (
  status: TemplateCriterionStatus
): TemplateCriterionStatus =>
{
  if (!TEMPLATE_CRITERION_STATUS_SET.has(status))
  {
    failInput('template criterion status is invalid')
  }
  return status
}

export const validateTemplateCriteria = (
  criteria: readonly MarketplaceTemplateCriterion[]
): MarketplaceTemplateCriterion[] =>
{
  if (criteria.length === 0)
  {
    failInput('template criteria cannot be empty')
  }
  if (criteria.length > MAX_TEMPLATE_CRITERIA)
  {
    failInput(`too many template criteria: ${criteria.length}`)
  }

  const seenExternalIds = new Set<string>()
  let primaryCount = 0

  const normalized = criteria.map((criterion) =>
  {
    const externalId = validateCriterionExternalId(criterion.externalId)
    if (seenExternalIds.has(externalId))
    {
      failInput(`duplicate template criterion externalId: ${externalId}`)
    }
    seenExternalIds.add(externalId)

    const status = validateCriterionStatus(criterion.status)
    if (criterion.isPrimary)
    {
      primaryCount += 1
    }

    return {
      externalId,
      name: normalizeRequiredText(
        criterion.name,
        MAX_TEMPLATE_CRITERION_NAME_LENGTH,
        'template criterion name'
      ),
      shortName: normalizeNullableText(
        criterion.shortName,
        MAX_TEMPLATE_CRITERION_SHORT_NAME_LENGTH,
        'template criterion shortName'
      ),
      prompt: normalizeRequiredText(
        criterion.prompt,
        MAX_TEMPLATE_CRITERION_PROMPT_LENGTH,
        'template criterion prompt'
      ),
      axisTop: normalizeNullableText(
        criterion.axisTop,
        MAX_TEMPLATE_CRITERION_AXIS_LABEL_LENGTH,
        'template criterion axisTop'
      ),
      axisBottom: normalizeNullableText(
        criterion.axisBottom,
        MAX_TEMPLATE_CRITERION_AXIS_LABEL_LENGTH,
        'template criterion axisBottom'
      ),
      order: validateCriterionOrder(criterion.order),
      isPrimary: criterion.isPrimary,
      status,
    }
  })

  if (primaryCount === 0)
  {
    failInput('template criteria must include one primary criterion')
  }
  if (primaryCount > 1)
  {
    failInput('template criteria must include only one primary criterion')
  }
  if (
    normalized.find((criterion) => criterion.isPrimary)?.status !== 'active'
  )
  {
    failInput('primary template criterion must be active')
  }

  return normalized
}

export const resolveTemplateCriteria = (
  source: TemplateCriteriaSource
): MarketplaceTemplateCriterion[] =>
  source.criteria === undefined || source.criteria === null
    ? buildDefaultTemplateCriteria()
    : (source.criteria as MarketplaceTemplateCriterion[])

export const resolvePrimaryTemplateCriterion = (
  source: TemplateCriteriaSource
): MarketplaceTemplateCriterion =>
  resolveTemplateCriteria(source).find((criterion) => criterion.isPrimary) ??
  buildDefaultTemplateCriterion()

export const findActiveTemplateCriterion = (
  source: TemplateCriteriaSource,
  externalId: string | null | undefined
): MarketplaceTemplateCriterion | null =>
{
  if (!externalId) return null
  return (
    resolveTemplateCriteria(source).find(
      (criterion) =>
        criterion.externalId === externalId && criterion.status === 'active'
    ) ?? null
  )
}

export const resolveActiveTemplateCriterion = (
  source: TemplateCriteriaSource,
  externalId?: string
): MarketplaceTemplateCriterion =>
{
  const criteria = resolveTemplateCriteria(source)
  if (externalId !== undefined)
  {
    const normalizedExternalId = validateCriterionExternalId(externalId)
    const requested = criteria.find(
      (criterion) => criterion.externalId === normalizedExternalId
    )
    if (requested?.status === 'active') return requested
    return failInput('active template criterion not found')
  }

  const primary = criteria.find(
    (criterion) => criterion.isPrimary && criterion.status === 'active'
  )
  if (primary) return primary

  let active: MarketplaceTemplateCriterion | null = null
  for (const criterion of criteria)
  {
    if (criterion.status !== 'active') continue
    if (!active || criterion.order < active.order)
    {
      active = criterion
    }
  }
  if (active) return active
  return failInput('template has no active criteria')
}

export const resolveTemplateCriterionForHistoricalRead = (
  source: TemplateCriteriaSource,
  externalId: string
): MarketplaceTemplateCriterion | null =>
{
  const normalizedExternalId = normalizeTemplateCriterionExternalId(externalId)
  return (
    resolveTemplateCriteria(source).find(
      (criterion) => criterion.externalId === normalizedExternalId
    ) ?? null
  )
}

export const toTemplateCriterionSnapshot = (
  criterion: MarketplaceTemplateCriterion
): MarketplaceTemplateCriterionSnapshot => ({
  externalId: criterion.externalId,
  name: criterion.name,
  prompt: criterion.prompt,
})

export const buildDefaultTemplateCriterionSnapshot =
  (): MarketplaceTemplateCriterionSnapshot =>
    toTemplateCriterionSnapshot(buildDefaultTemplateCriterion())
