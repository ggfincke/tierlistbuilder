// src/features/workspace/sharing/inbound/inboundShare.ts
// inbound share resolver shared by workspace bootstrap & embed

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
} from '~/features/workspace/sharing/snapshot-compression/hashShare'
import {
  clearShortLinkSlugFromUrl,
  decodeBoardFromShortLink,
  getShortLinkSlugFromUrl,
} from '~/features/workspace/sharing/short-link/shortLinkShare'

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

export const clearInboundShareFromUrl = (): void =>
{
  clearShareFragment()
  clearShortLinkSlugFromUrl()
}

// resolve the current URL's share marker into a BoardSnapshot
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
  if (!slug)
  {
    return { kind: 'none' }
  }

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
