// convex/lib/uploadToken.ts
// upload-token helper — generate a lowercase hex token for upload envelopes

import { UPLOAD_TOKEN_BYTES } from '@tierlistbuilder/contracts/platform/uploadEnvelope'

export const generateUploadToken = (): string =>
{
  const bytes = new Uint8Array(UPLOAD_TOKEN_BYTES)
  crypto.getRandomValues(bytes)

  let token = ''
  for (let i = 0; i < bytes.length; i++)
  {
    token += bytes[i].toString(16).padStart(2, '0')
  }

  return token
}
