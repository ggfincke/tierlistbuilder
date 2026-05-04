// src/features/platform/share/inboundShare.ts
// inbound hash-share resolver shared by workspace bootstrap & embed

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
} from '~/shared/sharing/hashShare'

type InboundShareSource = 'fragment'

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

export const clearInboundShareFromUrl = (): void =>
{
  clearShareFragment()
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

  return { kind: 'none' }
}
