// tests/contracts/uploadEnvelope.test.ts
// verify envelope wrap/unwrap rejects kind/token/userId mismatch — userId
// binding defends against cross-account finalize w/ another user's pair

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
  it('unwraps a payload when kind, userId, & token all match', () =>
  {
    const payload = new Uint8Array([1, 2, 3, 4])
    const wrapped = wrap('media', USER_A, TOKEN_A, payload)

    expect(unwrapUploadEnvelope('media', USER_A, TOKEN_A, wrapped)).toEqual(
      payload
    )
  })

  it('rejects a mismatched kind', () =>
  {
    const wrapped = wrap('media', USER_A, TOKEN_A, new Uint8Array([255]))

    expect(
      unwrapUploadEnvelope('snapshot', USER_A, TOKEN_A, wrapped)
    ).toBeNull()
  })

  it('rejects a mismatched token', () =>
  {
    const wrapped = wrap('snapshot', USER_A, TOKEN_A, new Uint8Array([7]))

    expect(
      unwrapUploadEnvelope('snapshot', USER_A, TOKEN_B, wrapped)
    ).toBeNull()
  })

  it('rejects a mismatched userId — defends against cross-account finalize', () =>
  {
    const wrapped = wrap('media', USER_A, TOKEN_A, new Uint8Array([42]))

    expect(unwrapUploadEnvelope('media', USER_B, TOKEN_A, wrapped)).toBeNull()
  })

  it('rejects malformed userIds at build time', () =>
  {
    expect(() =>
      getUploadEnvelopeHeader('media', 'has:colon', TOKEN_A)
    ).toThrow(/invalid upload userId/)
    expect(() => getUploadEnvelopeHeader('media', '', TOKEN_A)).toThrow(
      /invalid upload userId/
    )
  })

  it('rejects malformed tokens at build time', () =>
  {
    expect(() => getUploadEnvelopeHeader('media', USER_A, 'short')).toThrow(
      /invalid upload token/
    )
  })
})
