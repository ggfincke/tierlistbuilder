// tests/convex/templateCriteria.test.ts
// Guard curated template criterion validation & default resolution.

import { describe, expect, it } from 'vitest'
import type { MarketplaceTemplateCriterion } from '@tierlistbuilder/contracts/marketplace/templateCriterion'
import { validateTemplateCriteria } from '@convex/marketplace/templates/criteria'

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
