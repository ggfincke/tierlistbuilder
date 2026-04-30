// src/features/platform/share/inboundShare.ts
// inbound share resolver shared by workspace bootstrap & embed

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
} from '~/shared/sharing/hashShare'
import {
  clearShortLinkSlugFromUrl,
  decodeBoardFromShortLink,
  getShortLinkSlugFromUrl,
} from '~/features/platform/share/shortLinkShare'

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

export interface ResolveInboundShareOptions
{
  signal?: AbortSignal
}

export const clearInboundShareFromUrl = (): void =>
{
  clearShareFragment()
  clearShortLinkSlugFromUrl()
}

// resolve the current URL's share marker into a BoardSnapshot
export const resolveInboundShare = async (
  options: ResolveInboundShareOptions = {}
): Promise<InboundShareResult> =>
{
  const { signal } = options
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')

  const fragment = getShareFragment()
  if (fragment)
  {
    try
    {
      const data = await decodeBoardFromShareFragment(fragment)
      if (signal?.aborted) throw signal.reason ?? new Error('aborted')
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
    const data = await decodeBoardFromShortLink(slug, signal)
    return { kind: 'resolved', source: 'slug', data }
  }
  catch (error)
  {
    return { kind: 'failed', source: 'slug', error }
  }
}
