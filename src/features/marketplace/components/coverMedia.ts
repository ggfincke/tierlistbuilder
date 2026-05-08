// src/features/marketplace/components/coverMedia.ts
// cover-media framing helpers shared by marketplace card surfaces

import type { TemplateMediaRef } from '@tierlistbuilder/contracts/marketplace/template'

const WIDE_HERO_MEDIA_ASPECT_RATIO = 2.35

export const isWideHeroCoverMedia = (media: TemplateMediaRef): boolean =>
  media.width / media.height >= WIDE_HERO_MEDIA_ASPECT_RATIO
