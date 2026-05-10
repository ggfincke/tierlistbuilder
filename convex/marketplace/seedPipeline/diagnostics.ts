// convex/marketplace/seedPipeline/diagnostics.ts
// release-verify diagnostics: per-template parallel reads check cover/items/
// item-media presence & flag mismatches against expected totals

import type { MutationCtx } from '../../_generated/server'
import type { SeedTemplateReleaseStatus } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { SEED_LIMITS } from '../../lib/limits'
import { loadSeedTemplatesForRelease } from './templates'
import type { SeedDiagnosticRow } from './types'

export const buildSeedReleaseDiagnostics = async (
  ctx: MutationCtx,
  datasetKey: string,
  releaseId: string,
  expectedTotals: {
    templateCount: number
    itemCount: number
    criterionCount: number
  }
): Promise<SeedDiagnosticRow[]> =>
{
  const diagnostics: SeedDiagnosticRow[] = []
  const templates = await loadSeedTemplatesForRelease(
    ctx,
    datasetKey,
    releaseId
  )
  if (templates.length > SEED_LIMITS.templatesPerDiff)
  {
    diagnostics.push({
      code: 'templateLimitExceeded',
      message: 'release has more templates than seed verification can inspect',
      path: '$.templates',
      severity: 'error',
    })
    return diagnostics
  }

  const validTemplateStatuses = new Set<SeedTemplateReleaseStatus>([
    'applied_hidden',
    'verified',
    'active',
  ])
  // fan out per-template reads (cover + items + each item's media) so verify
  // completes in O(slowest template); releases over the read budget already
  // short-circuit above via templateLimitExceeded
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
      diagnostics.push({
        code: 'invalidTemplateReleaseStatus',
        message: `template has invalid seed release status: ${template.seedExternalId}`,
        path: `${templatePath}.seedReleaseStatus`,
        severity: 'error',
      })
    }
    if (template.coverMediaAssetId !== null && !coverMedia)
    {
      diagnostics.push({
        code: 'missingCoverMedia',
        message: `template cover media is missing: ${template.seedExternalId}`,
        path: `${templatePath}.coverMediaAssetId`,
        severity: 'error',
      })
    }
    if (items.length > SEED_LIMITS.itemsPerTemplate)
    {
      diagnostics.push({
        code: 'itemLimitExceeded',
        message: `template item count exceeds seed verification limit: ${template.seedExternalId}`,
        path: `${templatePath}.items`,
        severity: 'error',
      })
      continue
    }
    itemCount += items.length
    criterionCount += template.criteria.length
    if (template.itemCount !== items.length)
    {
      diagnostics.push({
        code: 'templateItemCountMismatch',
        message: `template itemCount=${template.itemCount} but has ${items.length} item rows`,
        path: `${templatePath}.itemCount`,
        severity: 'error',
      })
    }
    if (itemMedia)
    {
      for (let index = 0; index < items.length; index += 1)
      {
        const item = items[index]
        if (item.mediaAssetId === null)
        {
          diagnostics.push({
            code: 'missingItemMedia',
            message: `template item has no media: ${item.externalId}`,
            path: `${templatePath}.items[${item.externalId}].mediaAssetId`,
            severity: 'error',
          })
          continue
        }
        if (!itemMedia[index])
        {
          diagnostics.push({
            code: 'missingItemMediaAsset',
            message: `template item media asset is missing: ${item.externalId}`,
            path: `${templatePath}.items[${item.externalId}].mediaAssetId`,
            severity: 'error',
          })
        }
      }
    }
  }

  const actual = {
    templateCount: templates.length,
    itemCount,
    criterionCount,
  }
  for (const key of Object.keys(actual) as (keyof typeof actual)[])
  {
    if (actual[key] === expectedTotals[key]) continue
    diagnostics.push({
      code: `${key}Mismatch`,
      message: `${key} expected ${expectedTotals[key]} but found ${actual[key]}`,
      path: `$.totals.${key}`,
      severity: 'error',
    })
  }
  return diagnostics
}
