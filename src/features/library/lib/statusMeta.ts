// src/features/library/lib/statusMeta.ts
// presentation metadata for LibraryBoardStatus values — hardcoded semantic
// hues; label text is the primary signal & color is decorative

import type { LibraryBoardStatus } from '@tierlistbuilder/contracts/workspace/board'

interface LibraryStatusMeta
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
  syncing: {
    label: 'Syncing',
    textColor: '#93c5fd',
    dotColor: '#60a5fa',
    hoverAction: 'View progress',
  },
  failed: {
    label: 'Failed',
    textColor: 'var(--t-destructive-hover)',
    dotColor: '#ef4444',
    hoverAction: 'Review',
  },
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
