// src/features/platform/share/inboundShare.ts
// inbound share resolver shared by workspace bootstrap & embed

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
  isShareFragmentDecodeError,
} from '~/shared/sharing/hashShare'
import {
  clearShortLinkSlugFromUrl,
  decodeBoardFromShortLink,
  getRawShortLinkSlugFromUrl,
  isShortLinkDecodeError,
} from '~/features/platform/share/shortLinkShare'

type InboundShareSource = 'fragment' | 'slug'

type InboundShareFailureReason =
  | 'missing'
  | 'invalid'
  | 'too-large'
  | 'not-found'
  | 'unavailable'

interface InboundShareResolved
{
  kind: 'resolved'
  source: InboundShareSource
  data: BoardSnapshot
}

interface InboundShareFailed
{
  kind: 'failed'
  source: InboundShareSource
  reason: InboundShareFailureReason
  error: unknown
}

interface InboundShareNone
{
  kind: 'none'
}

type InboundShareResult =
  | InboundShareResolved
  | InboundShareFailed
  | InboundShareNone

interface ResolveInboundShareOptions
{
  signal?: AbortSignal
}

interface InboundShareRecoveryCopy
{
  title: string
  body: string
  toast: string
}

export const clearInboundShareFromUrl = (): void =>
{
  clearShareFragment()
  clearShortLinkSlugFromUrl()
}

const classifyInboundShareFailure = (
  source: InboundShareSource,
  error: unknown
): InboundShareFailureReason =>
{
  if (source === 'fragment' && isShareFragmentDecodeError(error))
  {
    if (error.kind === 'empty') return 'missing'
    if (error.kind === 'too-large') return 'too-large'
    return 'invalid'
  }

  if (source === 'slug' && isShortLinkDecodeError(error))
  {
    if (error.kind === 'invalid-slug') return 'invalid'
    if (error.kind === 'not-found') return 'not-found'
    if (error.kind === 'fetch-failed') return 'unavailable'
    if (error.kind === 'too-large') return 'too-large'
    return 'invalid'
  }

  return 'unavailable'
}

export const getInboundShareRecoveryCopy = (
  result: InboundShareFailed | InboundShareNone
): InboundShareRecoveryCopy =>
{
  if (result.kind === 'none')
  {
    return {
      title: 'Share link required',
      body: 'This page needs a share link or embed URL. Generate one from the Export menu.',
      toast: 'This page needs a share link or embed URL.',
    }
  }

  if (result.reason === 'missing')
  {
    return {
      title: 'Share link is incomplete',
      body: 'The URL is missing its share payload. Open the original link or generate a fresh one from the Export menu.',
      toast:
        'This share link is incomplete. Open the original link or generate a fresh one.',
    }
  }

  if (result.reason === 'not-found')
  {
    return {
      title: 'Share link unavailable',
      body: 'This share link may have expired, been revoked, or been removed.',
      toast:
        'This share link is no longer available. It may have expired or been removed.',
    }
  }

  if (result.reason === 'too-large')
  {
    return {
      title: 'Share link is too large',
      body: 'This snapshot is too large for this version of the app. Ask for a fresh share link.',
      toast:
        'This share link is too large for this version of the app. Ask for a fresh one.',
    }
  }

  if (result.reason === 'unavailable')
  {
    return {
      title: 'Share link could not load',
      body: 'The snapshot could not be loaded. Check your connection, then try the link again.',
      toast:
        'This share link could not load. Check your connection and try again.',
    }
  }

  return {
    title: 'Share link is damaged',
    body: 'The URL looks incomplete or corrupted. Open the original link or ask for a fresh one.',
    toast:
      'This share link looks damaged or incomplete. Open the original link or ask for a fresh one.',
  }
}

// resolve the current URL's share marker into a BoardSnapshot
export const resolveInboundShare = async (
  options: ResolveInboundShareOptions = {}
): Promise<InboundShareResult> =>
{
  const { signal } = options
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')

  const fragment = getShareFragment()
  if (fragment !== null)
  {
    try
    {
      const data = await decodeBoardFromShareFragment(fragment)
      if (signal?.aborted) throw signal.reason ?? new Error('aborted')
      return { kind: 'resolved', source: 'fragment', data }
    }
    catch (error)
    {
      return {
        kind: 'failed',
        source: 'fragment',
        reason: classifyInboundShareFailure('fragment', error),
        error,
      }
    }
  }

  const slug = getRawShortLinkSlugFromUrl()
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
    return {
      kind: 'failed',
      source: 'slug',
      reason: classifyInboundShareFailure('slug', error),
      error,
    }
  }
}
