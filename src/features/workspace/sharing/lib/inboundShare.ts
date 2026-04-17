// src/features/workspace/sharing/lib/inboundShare.ts
// unified inbound share resolver — check legacy #share= fragment first (no
// network), then ?s=<slug> short link. keeps the bootstrap (useAppBootstrap)
// & embed (EmbedView) paths from drifting on order of precedence

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { decodeBoardFromShareFragment, getShareFragment } from './hashShare'
import {
  decodeBoardFromShortLink,
  getShortLinkSlugFromUrl,
} from './shortLinkShare'

export type InboundShareSource = 'fragment' | 'slug'

export interface InboundShareResolved
{
  kind: 'resolved'
  source: InboundShareSource
  data: BoardSnapshot
}

export interface InboundShareFailed
{
  kind: 'failed'
  source: InboundShareSource
  error: unknown
}

export interface InboundShareNone
{
  kind: 'none'
}

export type InboundShareResult =
  | InboundShareResolved
  | InboundShareFailed
  | InboundShareNone

// fragment first (cheaper, self-contained), slug second. callers that care
// about which marker was present use `source` on the resolved/failed result
export const resolveInboundShare = async (): Promise<InboundShareResult> =>
{
  const fragment = getShareFragment()
  if (fragment)
  {
    try
    {
      const data = await decodeBoardFromShareFragment(fragment)
      return { kind: 'resolved', source: 'fragment', data }
    }
    catch (error)
    {
      return { kind: 'failed', source: 'fragment', error }
    }
  }

  const slug = getShortLinkSlugFromUrl()
  if (slug)
  {
    try
    {
      const data = await decodeBoardFromShortLink(slug)
      return { kind: 'resolved', source: 'slug', data }
    }
    catch (error)
    {
      return { kind: 'failed', source: 'slug', error }
    }
  }

  return { kind: 'none' }
}
