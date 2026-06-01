// src/shared/board-ui/ShowcaseRenderContext.ts
// render context for tlotl showcase tiles — maps each ranking lane to its
// resolved cover/mini payload so ItemContent can draw the tile

import { createContext, type ReactNode } from 'react'
import type { ShowcaseRankingTile } from '@tierlistbuilder/contracts/social/showcase'

export interface ShowcaseRenderState
{
  // keyed by board externalId
  tiles: Map<string, ShowcaseRankingTile>
  // optional per-tile link wrapper — the read-only profile supplies a router
  // Link; the editor omits it (tiles are draggable, not links)
  linkTile?: (rankingSlug: string, children: ReactNode) => ReactNode
}

// null on normal boards; a provider supplies state only on showcase surfaces
export const ShowcaseRenderContext = createContext<ShowcaseRenderState | null>(
  null
)
