// src/features/workspace/boards/ui/shared/useTierMoveTargets.ts
// shared move-target presentation data for bulk actions & item menus

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { selectTiersMeta } from '~/features/workspace/boards/model/slices/selectors'
import { useCurrentPaletteId } from '~/features/workspace/board-settings/model/useCurrentPaletteId'
import { getTextColor } from '~/shared/lib/color'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'

export const useTierMoveTargets = () =>
{
  const tiers = useActiveBoardStore(selectTiersMeta)
  const paletteId = useCurrentPaletteId()

  return tiers.map((tier) =>
  {
    const color = resolveTierColorSpec(paletteId, tier.colorSpec)
    return {
      id: tier.id,
      name: tier.name,
      color,
      textColor: getTextColor(color),
    }
  })
}
