// tests/convex/templateCriteria.test.ts
// Guard curated template criterion validation & default resolution.

import { describe, expect, it } from 'vitest'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import {
  buildDefaultTemplateCriterion,
  resolveActiveTemplateCriterion,
  resolvePrimaryTemplateCriterion,
  resolveTemplateCriteria,
  toTemplateCriterionSnapshot,
  validateTemplateCriteria,
} from '@convex/marketplace/templates/criteria'

const criterion = (
  overrides: Partial<MarketplaceTemplateCriterion> = {}
): MarketplaceTemplateCriterion => ({
  externalId: 'competitive',
  name: 'Competitive',
  shortName: null,
  prompt: 'Rank by competitive viability.',
  axisTop: null,
  axisBottom: null,
  order: 0,
  isPrimary: true,
  status: 'active',
  ...overrides,
})

describe('template criteria', () =>
{
  it('normalizes curated criteria and falls back to the default criterion', () =>
  {
    const defaultCriterion = buildDefaultTemplateCriterion()
    expect(resolveTemplateCriteria({})).toEqual([defaultCriterion])
    expect(resolvePrimaryTemplateCriterion({})).toEqual(defaultCriterion)
    expect(toTemplateCriterionSnapshot(defaultCriterion)).toEqual({
      externalId: 'default',
      name: 'Overall',
      prompt: 'Rank these items using the template prompt.',
    })

    const criteria = validateTemplateCriteria([
      criterion({
        externalId: '  FUN-To-Play  ',
        name: ' Fun to Play ',
        shortName: ' Fun ',
        prompt: ' Rank by how fun each item feels. ',
        axisTop: ' Most fun ',
        axisBottom: ' Least fun ',
      }),
      criterion({
        externalId: 'difficulty',
        name: 'Difficulty',
        prompt: 'Rank by difficulty.',
        order: 1,
        isPrimary: false,
      }),
    ])

    expect(criteria[0]).toEqual({
      externalId: 'fun-to-play',
      name: 'Fun to Play',
      shortName: 'Fun',
      prompt: 'Rank by how fun each item feels.',
      axisTop: 'Most fun',
      axisBottom: 'Least fun',
      order: 0,
      isPrimary: true,
      status: 'active',
    })
    expect(resolveActiveTemplateCriterion({ criteria }, 'difficulty')).toEqual(
      criteria[1]
    )
  })

  it('rejects identity collisions and invalid primary criteria', () =>
  {
    expect(() =>
      validateTemplateCriteria([
        criterion({ externalId: 'competitive' }),
        criterion({
          externalId: 'Competitive',
          name: 'Competitive duplicate',
          isPrimary: false,
        }),
      ])
    ).toThrow(/duplicate template criterion externalId/)

    expect(() =>
      validateTemplateCriteria([criterion({ externalId: '-bad-id' })])
    ).toThrow(/lowercase kebab-case/)

    expect(() =>
      validateTemplateCriteria([criterion({ isPrimary: false })])
    ).toThrow(/one primary/)

    expect(() =>
      validateTemplateCriteria([
        criterion(),
        criterion({ externalId: 'favorites', name: 'Favorites' }),
      ])
    ).toThrow(/only one primary/)

    expect(() =>
      validateTemplateCriteria([criterion({ status: 'hidden' })])
    ).toThrow(/primary template criterion must be active/)
  })
})
