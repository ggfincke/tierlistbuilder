// src/features/platform/share/inboundShare.ts
// inbound share resolver shared by workspace bootstrap & embed (hash-fragment only)

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import {
  clearShareFragment,
  decodeBoardFromShareFragment,
  getShareFragment,
  isShareFragmentDecodeError,
} from '~/shared/sharing/hashShare'

type InboundShareSource = 'fragment'

type InboundShareFailureReason = 'missing' | 'invalid' | 'too-large'

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

export const clearInboundShareFromUrl = (): void =>
{
  clearShareFragment()
}

const classifyInboundShareFailure = (
  error: unknown
): InboundShareFailureReason =>
{
  if (isShareFragmentDecodeError(error))
  {
    if (error.kind === 'empty') return 'missing'
    if (error.kind === 'too-large') return 'too-large'
    return 'invalid'
  }

  return 'invalid'
}

// resolve the current URL's share fragment into a BoardSnapshot
export const resolveInboundShare = async (
  options: ResolveInboundShareOptions = {}
): Promise<InboundShareResult> =>
{
  const { signal } = options
  if (signal?.aborted) throw signal.reason ?? new Error('aborted')

  const fragment = getShareFragment()
  if (fragment === null)
  {
    return { kind: 'none' }
  }

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
      reason: classifyInboundShareFailure(error),
      error,
    }
  }
}
