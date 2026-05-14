// src/features/workspace/boards/model/publishState.ts
// content-derived publish state per Bundle B (dev-docs/phase-7c-design.md).
// Draft / WIP / Live + empty edge case; never user-toggled.

// Draft = items exist but none in tiers. WIP = some placed, not published.
// Live = board published as a Ranking (Convex wiring lands in PR 3; until
// then the derivation stays content-only & Live is a passthrough input).

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import type { PublishState } from '@tierlistbuilder/contracts/workspace/board'
import type { ActiveBoardRuntimeState } from '~/features/workspace/boards/model/runtime'
import {
  PUBLISH_STATE_META,
  type PublishStateMeta,
} from '~/shared/board-ui/publishStateMeta'

// the workspace layers an 'empty' case onto the contract's PublishState — a
// board w/ zero items shows no chip at all, vs Draft which has items not yet
// placed. getPublishStateVisual maps 'empty' -> null
type WorkspacePublishState = PublishState | 'empty'

interface DerivePublishStateInputs
{
  activeItemCount: number
  tiers: ReadonlyArray<{ itemIds: readonly ItemId[] }>
  // when the board has been published as a Ranking, the source of truth lives
  // in the marketplace tables. Pass it through here so callers can lift the
  // chip to Live without re-implementing the derivation.
  publishedRankingId?: string | null
}

const derivePublishState = (
  inputs: DerivePublishStateInputs
): WorkspacePublishState =>
{
  if (inputs.publishedRankingId) return 'live'
  if (inputs.activeItemCount === 0) return 'empty'
  return inputs.tiers.some((tier) => tier.itemIds.length > 0) ? 'wip' : 'draft'
}

// selector form for direct use against useActiveBoardStore. The publishedRankingId
// hook-up is intentionally left out at this layer; lift it in via a wrapping
// hook once the marketplace cross-store is wired (PR 3).
export const selectPublishState = (
  state: Pick<ActiveBoardRuntimeState, 'activeItemCount' | 'tiers'>
): WorkspacePublishState =>
  derivePublishState({
    activeItemCount: state.activeItemCount,
    tiers: state.tiers,
  })

export const getPublishStateVisual = (
  state: WorkspacePublishState
): PublishStateMeta | null =>
  state === 'empty' ? null : PUBLISH_STATE_META[state]
