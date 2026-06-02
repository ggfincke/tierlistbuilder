// convex/marketplace/seed/lib/diagnostics.ts
// release-verify diagnostics: per-template parallel reads check cover/items/
// item-media presence & flag mismatches against expected totals

import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import type { SeedTemplateReleaseStatus } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { SEED_LIMITS } from '../../../lib/limits'
import type { SeedDiagnosticRow } from './types'
import { loadSeedTemplateLookupForRelease } from './templates'

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

export const pushCountMismatchDiagnostic = (
  diagnostics: SeedDiagnosticRow[],
  code: string,
  path: string,
  expected: number,
  actual: number,
  label: string
): void =>
{
  diagnostics.push(
    seedErrorDiagnostic(
      code,
      path,
      `${label} expected ${expected} but found ${actual}`
    )
  )
}

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

  // style coverage: a missing/duplicate default style or a partially-synced
  // non-default skin (zero rows, or rows w/ dangling media) must not pass
  // verification & activate a broken skin
  const perTemplateStyles = await Promise.all(
    templates.map(async (template) =>
    {
      const styles = await ctx.db
        .query('templateStyles')
        .withIndex('byTemplate', (q) => q.eq('templateId', template._id))
        .take(SEED_LIMITS.stylesPerTemplate + 1)
      return { template, styles }
    })
  )
  for (const { template, styles } of perTemplateStyles)
  {
    const templatePath = `$.templates[${template.seedExternalId ?? template._id}]`
    if (styles.length > SEED_LIMITS.stylesPerTemplate)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'styleLimitExceeded',
          `${templatePath}.styles`,
          `template style count exceeds seed verification limit: ${template.seedExternalId}`
        )
      )
      continue
    }
    if (styles.length === 0)
    {
      if (template.defaultStyleId !== null)
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'missingDefaultStyle',
            `${templatePath}.defaultStyleId`,
            `template names defaultStyleId "${template.defaultStyleId}" but has no style rows`
          )
        )
      }
      continue
    }
    const defaultStyles = styles.filter((style) => style.isDefault)
    if (defaultStyles.length !== 1)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'invalidDefaultStyleCount',
          `${templatePath}.styles`,
          `template must have exactly one default style, found ${defaultStyles.length}`
        )
      )
    }
    else if (template.defaultStyleId !== defaultStyles[0].externalId)
    {
      diagnostics.push(
        seedErrorDiagnostic(
          'defaultStyleIdMismatch',
          `${templatePath}.defaultStyleId`,
          `defaultStyleId "${template.defaultStyleId}" does not name the default style "${defaultStyles[0].externalId}"`
        )
      )
    }
    for (const style of styles)
    {
      const stylePath = `${templatePath}.styles[${style.externalId}]`
      if (
        style.coverMediaAssetId !== null &&
        !(await ctx.db.get(style.coverMediaAssetId))
      )
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'missingStyleCoverMedia',
            `${stylePath}.coverMediaAssetId`,
            `style cover media is missing: ${style.externalId}`
          )
        )
      }
      // default skin reuses templateItems (already verified above); only
      // non-default skins carry their own per-item asset rows
      if (style.isDefault) continue
      const assets = await ctx.db
        .query('templateItemStyleAssets')
        .withIndex('byTemplateStyleAndItem', (q) =>
          q
            .eq('templateId', template._id)
            .eq('styleExternalId', style.externalId)
        )
        .take(SEED_LIMITS.itemsPerTemplate + 1)
      if (assets.length === 0)
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'emptyStyleAssets',
            `${stylePath}.items`,
            `non-default style has no item assets: ${style.externalId}`
          )
        )
        continue
      }
      if (assets.length > SEED_LIMITS.itemsPerTemplate)
      {
        diagnostics.push(
          seedErrorDiagnostic(
            'styleAssetLimitExceeded',
            `${stylePath}.items`,
            `style asset count exceeds seed verification limit: ${style.externalId}`
          )
        )
        continue
      }
      // mediaAssetId null = item intentionally absent in this skin; only a
      // non-null id pointing at a missing asset is a broken skin
      const styleItemMedia = await Promise.all(
        assets.map((asset) =>
          asset.mediaAssetId
            ? ctx.db.get(asset.mediaAssetId)
            : Promise.resolve(null)
        )
      )
      assets.forEach((asset, index) =>
      {
        if (asset.mediaAssetId !== null && !styleItemMedia[index])
        {
          diagnostics.push(
            seedErrorDiagnostic(
              'missingStyleItemMediaAsset',
              `${stylePath}.items[${asset.itemExternalId}].mediaAssetId`,
              `style item media asset is missing: ${asset.itemExternalId}`
            )
          )
        }
      })
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
    pushCountMismatchDiagnostic(
      diagnostics,
      `${key}Mismatch`,
      `$.totals.${key}`,
      expectedTotals[key],
      actual[key],
      key
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
  const { byExternalId } = await loadSeedTemplateLookupForRelease(
    ctx,
    datasetKey,
    releaseId
  )
  const templates: Doc<'templates'>[] = []
  for (const externalId of templateExternalIds)
  {
    const row = byExternalId.get(externalId)
    if (row)
    {
      templates.push(row)
      continue
    }
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
