// tests/contracts/uploadEnvelope.test.ts
// envelope wrap/unwrap binds kind+userId+token to defend against tampering

import { describe, expect, it } from 'vitest'
import {
  getUploadEnvelopeHeader,
  unwrapUploadEnvelope,
} from '@tierlistbuilder/contracts/platform/uploadEnvelope'

const TOKEN_A =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const TOKEN_B =
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
const USER_A = 'j5x3k1example000000000000000000'
const USER_B = 'j5y7q2example000000000000000000'

const wrap = (
  kind: 'media' | 'snapshot',
  userId: string,
  token: string,
  payload: Uint8Array
): Uint8Array =>
{
  const header = getUploadEnvelopeHeader(kind, userId, token)
  const wrapped = new Uint8Array(header.length + payload.length)
  wrapped.set(header, 0)
  wrapped.set(payload, header.length)
  return wrapped
}

describe('uploadEnvelope', () =>
{
  it('round-trips matching envelopes & rejects kind/token/userId mismatch', () =>
  {
    const payload = new Uint8Array([1, 2, 3, 4])
    const wrapped = wrap('media', USER_A, TOKEN_A, payload)
    expect(unwrapUploadEnvelope('media', USER_A, TOKEN_A, wrapped)).toEqual(
      payload
    )

    expect(
      unwrapUploadEnvelope('snapshot', USER_A, TOKEN_A, wrapped)
    ).toBeNull()
    expect(unwrapUploadEnvelope('media', USER_A, TOKEN_B, wrapped)).toBeNull()
    expect(unwrapUploadEnvelope('media', USER_B, TOKEN_A, wrapped)).toBeNull()
  })
})
