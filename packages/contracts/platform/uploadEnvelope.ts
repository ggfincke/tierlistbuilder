// packages/contracts/platform/uploadEnvelope.ts
// upload-envelope helpers — bind raw storage uploads to a server-issued token
// & the authenticated userId; server rebuilds the expected header at finalize

export type UploadEnvelopeKind = 'media' | 'snapshot'

export const UPLOAD_TOKEN_BYTES = 32
export const UPLOAD_TOKEN_HEX_LENGTH = UPLOAD_TOKEN_BYTES * 2

// upper bound on envelope header size in bytes — server's pre-fetch size
// guard caps at MAX_* + this. actual headers ~150 bytes; slack absorbs format
// changes & long userIds
export const UPLOAD_ENVELOPE_MAX_HEADER_BYTES = 256

const UPLOAD_ENVELOPE_PREFIX = 'tlbu1'
const UPLOAD_TOKEN_PATTERN = new RegExp(
  `^[0-9a-f]{${UPLOAD_TOKEN_HEX_LENGTH}}$`
)
// userId is a Convex-issued string id — reject anything w/ a colon or
// non-ASCII byte so a malicious client can't inject extra header segments
const UPLOAD_USER_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const textEncoder = new TextEncoder()

export const isUploadToken = (token: string): boolean =>
  UPLOAD_TOKEN_PATTERN.test(token)

const isValidEnvelopeUserId = (userId: string): boolean =>
  userId.length > 0 &&
  userId.length < UPLOAD_ENVELOPE_MAX_HEADER_BYTES &&
  UPLOAD_USER_ID_PATTERN.test(userId)

export const getUploadEnvelopeHeader = (
  kind: UploadEnvelopeKind,
  userId: string,
  token: string
): Uint8Array =>
{
  if (!isUploadToken(token))
  {
    throw new Error(
      `invalid upload token: expected ${UPLOAD_TOKEN_HEX_LENGTH} lowercase hex chars`
    )
  }

  if (!isValidEnvelopeUserId(userId))
  {
    throw new Error('invalid upload userId: must be a Convex id string')
  }

  return textEncoder.encode(
    `${UPLOAD_ENVELOPE_PREFIX}:${kind}:${userId}:${token}:`
  )
}

export const unwrapUploadEnvelope = (
  kind: UploadEnvelopeKind,
  userId: string,
  token: string,
  bytes: Uint8Array
): Uint8Array | null =>
{
  if (!isUploadToken(token) || !isValidEnvelopeUserId(userId))
  {
    return null
  }

  const header = getUploadEnvelopeHeader(kind, userId, token)
  if (bytes.length < header.length)
  {
    return null
  }

  for (let i = 0; i < header.length; i++)
  {
    if (bytes[i] !== header[i])
    {
      return null
    }
  }

  return bytes.subarray(header.length)
}
