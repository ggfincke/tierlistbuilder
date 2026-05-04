// src/features/marketplace/model/accessMeta.ts
// presentation metadata for template access states (gating reasons)

import type { TemplateCardAccessState } from '@tierlistbuilder/contracts/marketplace/template'

interface AccessMeta
{
  // short pill text shown on the card cover; null = no chip
  chipLabel: string | null
  // CTA button label when this state is active
  ctaLabel: string
  // tooltip / aria-description explaining the gate; null = no title attr
  ctaTooltip: string | null
}

export const ACCESS_META: Record<TemplateCardAccessState, AccessMeta> = {
  usable: {
    chipLabel: null,
    ctaLabel: 'Use this template',
    ctaTooltip: null,
  },
  requiresPlus: {
    chipLabel: 'Plus',
    ctaLabel: 'Plus required',
    ctaTooltip: 'This template is too large for the current plan.',
  },
  featureNotReady: {
    chipLabel: 'Soon',
    ctaLabel: 'Coming soon',
    ctaTooltip: 'Large template forking is not available yet.',
  },
}
