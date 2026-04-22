// src/features/workspace/sharing/inbound/inboundShare.ts
// inbound short-link resolver shared by workspace bootstrap & embed

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  decodeBoardFromShortLink,
  getShortLinkSlugFromUrl,
} from '~/features/workspace/sharing/short-link/shortLinkShare'

export interface InboundShareResolved
{
  kind: 'resolved'
  data: BoardSnapshot
}

export interface InboundShareFailed
{
  kind: 'failed'
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

// resolve the current URL's short-link slug into a BoardSnapshot
export const resolveInboundShare = async (): Promise<InboundShareResult> =>
{
  const slug = getShortLinkSlugFromUrl()
  if (!slug)
  {
    return { kind: 'none' }
  }

  try
  {
    const data = await decodeBoardFromShortLink(slug)
    return { kind: 'resolved', data }
  }
  catch (error)
  {
    return { kind: 'failed', error }
  }
}
