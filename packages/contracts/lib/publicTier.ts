// packages/contracts/lib/publicTier.ts
// shared public tier-row projection for marketplace & showcase surfaces

import type { TierColorSpec } from './theme'

export interface PublicTierRow
{
  externalId: string
  name: string
  description: string | null
  colorSpec: TierColorSpec
  rowColorSpec: TierColorSpec | null
  order: number
}
