// convex/marketplace/seedPipeline/diagnostics.ts
// release-verify diagnostics: per-template parallel reads check cover/items/
// item-media presence & flag mismatches against expected totals

import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import type { SeedTemplateReleaseStatus } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { SEED_LIMITS } from '../../lib/limits'
import type { SeedDiagnosticRow } from './types'

export type SeedReleaseDiagnosticTotals = {
  templateCount: number
  itemCount: number
  criterionCount: number
}

export const seedDiagnostic = (
  severity: SeedDiagnosticRow['severity'],
  code: string,
  path: string,
  message: string
): SeedDiagnosticRow => ({ severity, code, path, message })

export const seedErrorDiagnostic = (
  code: string,
  path: string,
  message: string
): SeedDiagnosticRow => seedDiagnostic('error', code, path, message)

export const seedWarningDiagnostic = (
  code: string,
  path: string,
  message: string
): SeedDiagnosticRow => seedDiagnostic('warning', code, path, message)

export const buildSeedReleaseDiagnosticsForTemplates = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  templateExternalIds: readonly string[]
): Promise<{
  diagnostics: SeedDiagnosticRow[]
  totals: SeedReleaseDiagnosticTotals
}> =>
{
  const { templates, diagnostics } = await loadDiagnosticsTemplates(
    ctx,
    datasetKey,
    releaseId,
    templateExternalIds
  )
  if (templates.length > SEED_LIMITS.templatesPerDiff)
  {
    diagnostics.push(
      seedErrorDiagnostic(
        'templateLimitExceeded',
        '$.templates',
        'release has more templates than seed verification can inspect'
      )
    )
    return {
      diagnostics,
      totals: { templateCount: 0, itemCount: 0, criterionCount: 0 },
    }
  }

  const validTemplateStatuses = new Set<SeedTemplateReleaseStatus>([
    'applied_hidden',
    'verified',
    'active',
  ])
  // Keep this function scoped to a bounded template set. The Python runner
  // chunks large releases so per-item media validation stays under Convex's
  // per-function read budget.
  const perTemplate = await Promise.all(
    templates.map(async (template) =>
    {
      const [coverMedia, items] = await Promise.all([
        template.coverMediaAssetId
          ? ctx.db.get(template.coverMediaAssetId)
          : Promise.resolve(null),
        ctx.db
          .query('templateItems')
          .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
          .take(SEED_LIMITS.itemsPerTemplate + 1),
      ])
      const itemMedia =
        items.length > SEED_LIMITS.itemsPerTemplate
          ? null
          : await Promise.all(
              items.map((item) =>
                item.mediaAssetId
                  ? ctx.db.get(item.mediaAssetId)
                  : Promise.resolve(null)
              )
            )
      return { template, coverMedia, items, itemMedia }
    })
  )
  let itemCount = 0
  let criterionCount = 0
  for (const { template, coverMedia, items, itemMedia } of perTemplate)
  {
    const templatePath = `$.templates[${template.seedExternalId ?? template._id}]`
    if (
      !template.seedReleaseStatus ||
      !validTemplateStatuses.has(template.seedReleaseStatus)
    )
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'invalidTemplateReleaseStatus',
          `${templatePath}.seedReleaseStatus`,
          `template has invalid seed release status: ${template.seedExternalId}`
        )
      )
    }
    if (template.coverMediaAssetId !== null && !coverMedia)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'missingCoverMedia',
          `${templatePath}.coverMediaAssetId`,
          `template cover media is missing: ${template.seedExternalId}`
        )
      )
    }
    if (items.length > SEED_LIMITS.itemsPerTemplate)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'itemLimitExceeded',
          `${templatePath}.items`,
          `template item count exceeds seed verification limit: ${template.seedExternalId}`
        )
      )
      continue
    }
    itemCount += items.length
    criterionCount += template.criteria.length
    if (template.itemCount !== items.length)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'templateItemCountMismatch',
          `${templatePath}.itemCount`,
          `template itemCount=${template.itemCount} but has ${items.length} item rows`
        )
      )
    }
    if (itemMedia)
    {
      for (let index = 0; index < items.length; index += 1)
      {
        const item = items[index]
        if (item.mediaAssetId === null)
        {
          diagnostics.push(
            seedErrorDiagnostic(
              'missingItemMedia',
              `${templatePath}.items[${item.externalId}].mediaAssetId`,
              `template item has no media: ${item.externalId}`
            )
          )
          continue
        }
        if (!itemMedia[index])
        {
          diagnostics.push(
            seedErrorDiagnostic(
              'missingItemMediaAsset',
              `${templatePath}.items[${item.externalId}].mediaAssetId`,
              `template item media asset is missing: ${item.externalId}`
            )
          )
        }
      }
    }
  }

  const actual = {
    templateCount: templates.length,
    itemCount,
    criterionCount,
  }
  return { diagnostics, totals: actual }
}

export const appendExpectedTotalsDiagnostics = (
  diagnostics: SeedDiagnosticRow[],
  actual: SeedReleaseDiagnosticTotals,
  expectedTotals: {
    templateCount: number
    itemCount: number
    criterionCount: number
  }
): void =>
{
  for (const key of Object.keys(actual) as (keyof typeof actual)[])
  {
    if (actual[key] === expectedTotals[key]) continue
    diagnostics.push(
      seedErrorDiagnostic(
        `${key}Mismatch`,
        `$.totals.${key}`,
        `${key} expected ${expectedTotals[key]} but found ${actual[key]}`
      )
    )
  }
}

export const appendReleaseTemplateScopeDiagnostics = async (
  ctx: MutationCtx,
  diagnostics: SeedDiagnosticRow[],
  datasetKey: string,
  releaseId: string,
  expectedTotals: { templateCount: number }
): Promise<void> =>
{
  const templates = await ctx.db
    .query('templates')
    .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
      q.eq('seedDatasetKey', datasetKey).eq('seedReleaseId', releaseId)
    )
    .take(SEED_LIMITS.templatesPerDiff + 1)
  if (templates.length > SEED_LIMITS.templatesPerDiff)
  {
    diagnostics.push(
      seedErrorDiagnostic(
        'templateLimitExceeded',
        '$.templates',
        'release has more templates than seed verification can inspect'
      )
    )
    return
  }
  if (templates.length === expectedTotals.templateCount) return
  diagnostics.push(
    seedErrorDiagnostic(
      'releaseTemplateCountMismatch',
      '$.templates',
      `release has ${templates.length} templates but manifest expects ${expectedTotals.templateCount}`
    )
  )
}

const loadDiagnosticsTemplates = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  templateExternalIds: readonly string[]
): Promise<{
  templates: Doc<'templates'>[]
  diagnostics: SeedDiagnosticRow[]
}> =>
{
  const diagnostics: SeedDiagnosticRow[] = []
  const rows = await Promise.all(
    templateExternalIds.map(
      async (externalId) =>
        await ctx.db
          .query('templates')
          .withIndex('bySeedDatasetReleaseAndExternalId', (q) =>
            q
              .eq('seedDatasetKey', datasetKey)
              .eq('seedReleaseId', releaseId)
              .eq('seedExternalId', externalId)
          )
          .unique()
    )
  )
  const templates: Doc<'templates'>[] = []
  for (let index = 0; index < templateExternalIds.length; index += 1)
  {
    const row = rows[index]
    if (row)
    {
      templates.push(row)
      continue
    }
    const externalId = templateExternalIds[index]
    diagnostics.push(
      seedErrorDiagnostic(
        'missingTemplate',
        `$.templates[${externalId}]`,
        `seed template is missing: ${externalId}`
      )
    )
  }
  return { templates, diagnostics }
}
