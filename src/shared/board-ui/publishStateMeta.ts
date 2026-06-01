// src/shared/board-ui/publishStateMeta.ts
// shared UI metadata for the draft / WIP / live publish-state taxonomy

import type { PublishState } from '@tierlistbuilder/contracts/workspace/libraryBoard'

type PublishStateTone = 'neutral' | 'accent' | 'live'

export interface PublishStateMeta
{
  label: string
  tone: PublishStateTone
  description: string
  hoverAction: string
}

export const PUBLISH_STATE_META: Record<PublishState, PublishStateMeta> = {
  draft: {
    label: 'Draft',
    tone: 'neutral',
    description: 'No items placed yet — drag items into tiers to start.',
    hoverAction: 'Start ranking',
  },
  wip: {
    label: 'WIP',
    tone: 'accent',
    description:
      'Some items placed. Publish this board as a ranking when it is ready.',
    hoverAction: 'Continue',
  },
  live: {
    label: 'Live',
    tone: 'live',
    description: 'Published to the marketplace as a ranking.',
    hoverAction: 'Open',
  },
}
