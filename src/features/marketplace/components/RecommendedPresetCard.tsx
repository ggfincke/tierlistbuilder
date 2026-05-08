// src/features/marketplace/components/RecommendedPresetCard.tsx
// hero-rail panel showing the template's suggested tiers as a named preset

import { Layers } from 'lucide-react'

import type { TierPresetTier } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { PresetPreviewPills } from '~/shared/board-ui/PresetPreviewPills'

import { RailCard } from './consensus/RailCard'

const CLASSIC_SEQUENCE = ['S', 'A', 'B', 'C', 'D', 'E']

const inferPresetName = (tiers: readonly TierPresetTier[]): string =>
{
  const names = tiers.map((tier) => tier.name.trim().toUpperCase())
  if (
    names.length === CLASSIC_SEQUENCE.length &&
    names.every((name, index) => name === CLASSIC_SEQUENCE[index])
  )
  {
    return 'Classic (S-E)'
  }
  return 'Author preset'
}

interface RecommendedPresetCardProps
{
  tiers: readonly TierPresetTier[]
}

export const RecommendedPresetCard = ({
  tiers,
}: RecommendedPresetCardProps) =>
{
  const paletteId = usePreferencesStore((state) => state.paletteId)
  if (tiers.length === 0) return null
  const name = inferPresetName(tiers)
  return (
    <RailCard
      eyebrow={
        <>
          <Layers
            className="h-3 w-3 text-[var(--t-text-secondary)]"
            strokeWidth={2}
          />
          Recommended preset
        </>
      }
      meta={`${tiers.length} tiers`}
    >
      <p className="text-center text-[13px] font-medium text-[var(--t-text)]">
        {name}
      </p>
      <PresetPreviewPills
        tiers={tiers}
        paletteId={paletteId}
        className="mt-1.5 flex flex-wrap justify-center gap-1"
      />
    </RailCard>
  )
}
