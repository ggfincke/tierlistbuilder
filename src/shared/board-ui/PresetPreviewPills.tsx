// src/shared/board-ui/PresetPreviewPills.tsx
// inline tier-color pill row used by preset picker & marketplace recommended-preset card

import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { getContrastingTextShadow, getTextColor } from '~/shared/lib/color'

interface PresetPreviewPillsProps
{
  tiers: readonly TierPresetTier[]
  paletteId: PaletteId
  className?: string
}

export const PresetPreviewPills = ({
  tiers,
  paletteId,
  className = 'mt-1 flex flex-wrap gap-1',
}: PresetPreviewPillsProps) => (
  <div className={className}>
    {tiers.map((tier, index) =>
    {
      const tierColor = resolveTierColorSpec(paletteId, tier.colorSpec)
      const tierTextColor = getTextColor(tierColor)
      return (
        <span
          key={`${tier.name}-${index}`}
          className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium leading-none"
          style={{
            backgroundColor: tierColor,
            color: tierTextColor,
            textShadow: getContrastingTextShadow(tierColor),
          }}
        >
          {tier.name}
        </span>
      )
    })}
  </div>
)
