// tests/sharing/inboundShare.test.ts
// user-facing recovery copy for inbound workspace/embed share failures

import { describe, expect, it } from 'vitest'

import { getInboundShareRecoveryCopy } from '~/features/platform/share/inboundShare'

type RecoveryInput = Parameters<typeof getInboundShareRecoveryCopy>[0]
type FailedRecoveryInput = Extract<RecoveryInput, { kind: 'failed' }>

const failed = (reason: FailedRecoveryInput['reason']): RecoveryInput =>
  ({
    kind: 'failed',
    source: 'fragment',
    reason,
    error: new Error(String(reason)),
  }) satisfies FailedRecoveryInput

describe('inbound share recovery copy', () =>
{
  it('explains bare embed/share routes without implying expiry', () =>
  {
    const copy = getInboundShareRecoveryCopy({ kind: 'none' })

    expect(copy.title).toBe('Share link required')
    expect(copy.body).toContain('needs a share link or embed URL')
  })

  it('separates damaged links from expired or revoked links', () =>
  {
    const invalid = getInboundShareRecoveryCopy(failed('invalid'))
    const notFound = getInboundShareRecoveryCopy(failed('not-found'))

    expect(invalid.toast).toContain('damaged or incomplete')
    expect(notFound.toast).toContain('no longer available')
  })

  it('has distinct copy for oversized and temporarily unavailable shares', () =>
  {
    const tooLarge = getInboundShareRecoveryCopy(failed('too-large'))
    const unavailable = getInboundShareRecoveryCopy(failed('unavailable'))

    expect(tooLarge.title).toBe('Share link is too large')
    expect(unavailable.title).toBe('Share link could not load')
  })
})
