// convex/lib/validators/tierSpec.ts
// runtime tier-spec validation shared by boards, presets, & marketplace templates

import type { TierColorSpec } from '@tierlistbuilder/contracts/lib/theme'
import {
  MAX_SYNC_TIERS,
  MAX_TIER_DESCRIPTION_LEN,
  MAX_TIER_NAME_LEN,
} from '../limits'
import { validateHexColor } from '../hexColor'
import { assertStringLength, failInput } from '../text'

export interface TierSpecLike
{
  name: string
  description?: string
  colorSpec: TierColorSpec
  rowColorSpec?: TierColorSpec
}

interface ValidateTierSpecOptions
{
  requireName?: boolean
  requiredNameMessage?: string
}

interface ValidateTierSpecListOptions extends ValidateTierSpecOptions
{
  maxCount?: number
}

export const validateTierSpec = (
  tier: TierSpecLike,
  options: ValidateTierSpecOptions = {}
): void =>
{
  if (options.requireName && !tier.name.trim())
  {
    failInput(options.requiredNameMessage ?? 'tier name is required')
  }

  assertStringLength(
    'tier name',
    tier.name,
    MAX_TIER_NAME_LEN,
    ({ length, maxLength }) =>
      `tier name too long: ${length} exceeds ${maxLength}`
  )
  assertStringLength(
    'tier description',
    tier.description,
    MAX_TIER_DESCRIPTION_LEN,
    ({ maxLength }) => `tier description too long: exceeds ${maxLength}`
  )

  if (tier.colorSpec.kind === 'custom')
  {
    validateHexColor(tier.colorSpec.hex, 'tier.colorSpec.hex')
  }
  if (tier.rowColorSpec?.kind === 'custom')
  {
    validateHexColor(tier.rowColorSpec.hex, 'tier.rowColorSpec.hex')
  }
}

export const validateTierSpecList = (
  tiers: readonly TierSpecLike[],
  options: ValidateTierSpecListOptions = {}
): void =>
{
  const maxCount = options.maxCount ?? MAX_SYNC_TIERS
  if (tiers.length > maxCount)
  {
    failInput(`too many tiers: ${tiers.length} exceeds ${maxCount}`)
  }

  for (const tier of tiers)
  {
    validateTierSpec(tier, options)
  }
}
