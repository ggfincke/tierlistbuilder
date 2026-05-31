// convex/lib/uploadToken.ts
// upload-token helper — generate a lowercase hex token for upload envelopes

import { UPLOAD_TOKEN_BYTES } from '@tierlistbuilder/contracts/platform/uploadEnvelope'
import { bytesToHex } from './sha256'

export const generateUploadToken = (): string =>
{
  const bytes = new Uint8Array(UPLOAD_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}
