// tests/contracts/seedSchemaParity.test.ts
// JSON Schema enum & hex-color parity for seed manifests

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TEMPLATE_CATEGORIES } from '@tierlistbuilder/contracts/marketplace/category'
import { RANKING_FEATURED_BADGES } from '@tierlistbuilder/contracts/marketplace/ranking'
import { SEED_TEMPLATE_LABEL_POLICIES } from '@tierlistbuilder/contracts/marketplace/seedPipeline'
import { TEMPLATE_VISIBILITIES } from '@tierlistbuilder/contracts/marketplace/template'
import { TEMPLATE_CRITERION_STATUSES } from '@tierlistbuilder/contracts/marketplace/templateCriterion'

type JsonRecord = Record<string, unknown>

const HEX_COLOR_PATTERN = '^#[0-9a-fA-F]{6}$'

const readSchema = (relativePath: string): JsonRecord =>
  JSON.parse(
    readFileSync(join(process.cwd(), relativePath), 'utf8')
  ) as JsonRecord

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const at = (schema: JsonRecord, path: readonly string[]): JsonRecord =>
  path.reduce<JsonRecord>((current, key) =>
  {
    const next = current[key]
    if (!isRecord(next))
      throw new Error(`missing schema object: ${path.join('.')}`)
    return next
  }, schema)

const enumAt = (schema: JsonRecord, path: readonly string[]): string[] =>
{
  const value = at(schema, path).enum
  if (!Array.isArray(value))
    throw new Error(`missing schema enum: ${path.join('.')}`)
  return value.map(String)
}

const collectInlineHexPatterns = (
  value: unknown,
  path: readonly string[] = []
): string[] =>
{
  if (!isRecord(value)) return []
  const here = path.join('.')
  const matches =
    value.pattern === HEX_COLOR_PATTERN && here !== '$defs.hexColor'
      ? [here]
      : []
  return Object.entries(value).reduce<string[]>(
    (out, [key, child]) => [
      ...out,
      ...collectInlineHexPatterns(child, [...path, key]),
    ],
    matches
  )
}

describe('seed JSON Schemas', () =>
{
  const templateSchema = readSchema(
    'scripts/seed_pipeline/seed_pipeline/schemas/template.schema.json'
  )
  const compiledSchema = readSchema(
    'scripts/seed_pipeline/seed_pipeline/schemas/compiled-manifest.schema.json'
  )
  const rankingProfilesSchema = readSchema(
    'scripts/seed_pipeline/seed_pipeline/schemas/ranking-profiles.schema.json'
  )

  it('keeps seed enums aligned with TypeScript contracts', () =>
  {
    for (const schema of [templateSchema, compiledSchema])
    {
      expect(enumAt(schema, ['$defs', 'category'])).toEqual([
        ...TEMPLATE_CATEGORIES,
      ])
      expect(enumAt(schema, ['$defs', 'visibility'])).toEqual([
        ...TEMPLATE_VISIBILITIES,
      ])
      expect(enumAt(schema, ['$defs', 'labelPolicy'])).toEqual([
        ...SEED_TEMPLATE_LABEL_POLICIES,
      ])
      expect(
        enumAt(schema, ['$defs', 'criterion', 'properties', 'status'])
      ).toEqual([...TEMPLATE_CRITERION_STATUSES])
    }
    expect(enumAt(compiledSchema, ['$defs', 'rankingFeaturedBadge'])).toEqual([
      ...RANKING_FEATURED_BADGES,
    ])
    expect(
      enumAt(rankingProfilesSchema, ['$defs', 'rankingFeaturedBadge'])
    ).toEqual([...RANKING_FEATURED_BADGES])
  })

  it('uses $defs.hexColor instead of inline duplicate hex regexes', () =>
  {
    expect(collectInlineHexPatterns(templateSchema)).toEqual([])
    expect(collectInlineHexPatterns(compiledSchema)).toEqual([])
    expect(collectInlineHexPatterns(rankingProfilesSchema)).toEqual([])
  })
})
