// src/shared/board-ui/mediaPlate.ts
// map a per-item plate decision to the themeable --t-media-plate-* token passed
// to FramedItemMedia's backgroundColor, keeping cut-out logos readable anywhere

import type { MediaPlate } from '@tierlistbuilder/contracts/workspace/board'

const MEDIA_PLATE_VARS: Record<MediaPlate, string> = {
  light: 'var(--t-media-plate-light)',
  dark: 'var(--t-media-plate-dark)',
}

export const mediaPlateColor = (
  plate: MediaPlate | null | undefined
): string | undefined => (plate ? MEDIA_PLATE_VARS[plate] : undefined)
