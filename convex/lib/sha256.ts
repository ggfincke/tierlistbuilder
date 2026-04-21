// convex/lib/sha256.ts
// sha256 hex digest for Convex server code. mirrors shared/lib/sha256 on the
// client but lives under convex/ so the runtime import graph stays clean

// compute sha256 of a BufferSource & return a lowercase hex string
export const sha256Hex = async (bytes: BufferSource): Promise<string> =>
{
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < view.length; i++)
  {
    hex += view[i].toString(16).padStart(2, '0')
  }
  return hex
}
