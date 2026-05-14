// src/features/workspace/boards/model/publishState.ts
// content-derived publish state per Bundle B (dev-docs/phase-7c-design.md).
// Draft / WIP / Live + empty edge case; never user-toggled.

// Draft = items exist but none in tiers. WIP = some placed, not published.
// Live = board published as a Ranking (Convex wiring lands in PR 3; until
// then the derivation stays content-only & Live is a passthrough input).

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { ActiveBoardRuntimeState } from '~/features/workspace/boards/model/runtime'

export type PublishState = 'empty' | 'draft' | 'wip' | 'live'

export interface DerivePublishStateInputs
{
  activeItemCount: number
  tiers: ReadonlyArray<{ itemIds: readonly ItemId[] }>
  // when the board has been published as a Ranking, the source of truth lives
  // in the marketplace tables. Pass it through here so callers can lift the
  // chip to Live without re-implementing the derivation.
  publishedRankingId?: string | null
}

export const derivePublishState = (
  inputs: DerivePublishStateInputs
): PublishState =>
{
  if (inputs.publishedRankingId) return 'live'
  if (inputs.activeItemCount === 0) return 'empty'
  const ranked = inputs.tiers.reduce((sum, tier) => sum + tier.itemIds.length, 0)
  if (ranked === 0) return 'draft'
  return 'wip'
}

// selector form for direct use against useActiveBoardStore. The publishedRankingId
// hook-up is intentionally left out at this layer; lift it in via a wrapping
// hook once the marketplace cross-store is wired (PR 3).
export const selectPublishState = (
  state: Pick<ActiveBoardRuntimeState, 'activeItemCount' | 'tiers'>
): PublishState =>
  derivePublishState({
    activeItemCount: state.activeItemCount,
    tiers: state.tiers,
  })

interface PublishStateVisual
{
  label: string
  description: string
  // tone hints for the chip — neutral for draft/empty, accent for wip,
  // accent-pulsing for live. Concrete styling lives in BoardPublishChip.
  tone: 'neutral' | 'accent' | 'live'
}

export const getPublishStateVisual = (
  state: PublishState
): PublishStateVisual | null =>
{
  if (state === 'empty') return null
  if (state === 'draft')
  {
    return {
      label: 'Draft',
      description: 'No items placed yet — drag items into tiers to start.',
      tone: 'neutral',
    }
  }
  if (state === 'wip')
  {
    return {
      label: 'WIP',
      description: 'Some items placed. Publish this board as a ranking when it is ready.',
      tone: 'accent',
    }
  }
  return {
    label: 'Live',
    description: 'Published to the marketplace as a ranking.',
    tone: 'live',
  }
}
