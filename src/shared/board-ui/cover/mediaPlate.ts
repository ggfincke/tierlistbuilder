// src/shared/board-ui/cover/mediaPlate.ts
// resolve the backdrop behind an item image: a per-item background wins, else
// the board's auto-plate layer fills in (colors resolve to live theme tokens)

import {
  AUTO_PLATE_MODE_DEFAULT,
  AUTO_PLATE_UNIFORM_DEFAULT,
  type BoardAutoPlateSettings,
  type MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'

const MEDIA_PLATE_VARS: Record<MediaPlate, string> = {
  light: 'var(--t-media-plate-light)',
  dark: 'var(--t-media-plate-dark)',
}

// 'auto' mode plate for a logo, or undefined when its analysis found it already
// readable (mediaPlate absent)
const autoPlateColor = (
  plate: MediaPlate | null | undefined
): string | undefined => (plate ? MEDIA_PLATE_VARS[plate] : undefined)

interface BackdropItem
{
  backgroundColor?: string | null
  mediaPlate?: MediaPlate | null
}

// manual background > board auto-plate > none. `autoPlate` absent resolves to
// the On+Auto default, so callers that don't thread a setting stay readable
export const resolveItemBackdrop = (
  item: BackdropItem,
  autoPlate?: BoardAutoPlateSettings | null
): string | undefined =>
{
  if (item.backgroundColor) return item.backgroundColor
  const settings: BoardAutoPlateSettings = autoPlate ?? {
    mode: AUTO_PLATE_MODE_DEFAULT,
  }
  if (settings.mode === 'off') return undefined
  if (settings.mode === 'uniform')
  {
    return settings.uniformColor ?? AUTO_PLATE_UNIFORM_DEFAULT
  }
  return autoPlateColor(item.mediaPlate)
}
