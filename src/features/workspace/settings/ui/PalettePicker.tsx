// src/features/workspace/settings/ui/PalettePicker.tsx
// grid of clickable palette preview cards for the Appearance section

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { PALETTE_META, PALETTES } from '~/shared/theme/palettes'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { PickerGrid } from '~/shared/ui/PickerGrid'

// preview swatch count — capped at 6 so palettes w/ larger hue counts
// render a consistent card size across the grid
const PREVIEW_SWATCH_COUNT = 6

interface PalettePickerProps
{
  ariaLabelledby?: string
}

// module-scope memo of preview swatches per palette — avoids re-slicing
// palette.colors on every grid render
const PREVIEW_COLORS_BY_PALETTE = Object.fromEntries(
  PALETTE_META.map((m) => [
    m.id,
    PALETTES[m.id].colors.slice(0, PREVIEW_SWATCH_COUNT),
  ])
) as unknown as Record<PaletteId, readonly string[]>

const renderPalettePreview = (meta: (typeof PALETTE_META)[number]) =>
{
  const colors = PREVIEW_COLORS_BY_PALETTE[meta.id]
  return (
    <div className="flex w-full overflow-hidden rounded">
      {colors.map((color, i) => (
        <span key={i} className="h-5 flex-1" style={{ background: color }} />
      ))}
    </div>
  )
}

export const PalettePicker = ({ ariaLabelledby }: PalettePickerProps) =>
{
  const paletteId = useSettingsStore((s) => s.paletteId)
  const setPaletteId = useSettingsStore((s) => s.setPaletteId)

  return (
    <PickerGrid<PaletteId, (typeof PALETTE_META)[number]>
      items={PALETTE_META}
      activeKey={paletteId}
      onSelect={setPaletteId}
      ariaLabel="Tier color palette"
      ariaLabelledby={ariaLabelledby}
      columns={4}
      renderPreview={renderPalettePreview}
    />
  )
}
