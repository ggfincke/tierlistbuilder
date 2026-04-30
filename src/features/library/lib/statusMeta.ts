// src/features/library/lib/statusMeta.ts
// presentation metadata for LibraryBoardStatus values — hardcoded semantic
// hues; label text is the primary signal & color is decorative

import type { LibraryBoardStatus } from '@tierlistbuilder/contracts/workspace/board'

export interface LibraryStatusMeta
{
  label: string
  // text color of the pill label — saturated for AA over the surface chip
  textColor: string
  // small dot rendered to the left of the label; saturated semantic hue
  dotColor: string
  // CTA verb shown on the card hover overlay; describes the next action
  hoverAction: string
}

export const LIBRARY_STATUS_META: Record<
  LibraryBoardStatus,
  LibraryStatusMeta
> = {
  draft: {
    label: 'Draft',
    textColor: 'rgb(var(--t-overlay) / 0.55)',
    dotColor: '#9ca3af',
    hoverAction: 'Start ranking',
  },
  in_progress: {
    label: 'In progress',
    textColor: '#fbbf24',
    dotColor: '#f59e0b',
    hoverAction: 'Continue',
  },
  finished: {
    label: 'Finished',
    textColor: '#a3e635',
    dotColor: '#84cc16',
    hoverAction: 'Open',
  },
  published: {
    label: 'Published',
    textColor: '#67e8f9',
    dotColor: '#22d3ee',
    hoverAction: 'Open',
  },
}
