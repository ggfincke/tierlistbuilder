// src/shared/lib/sha256.ts
// sha256 helper — hex digest via SubtleCrypto, no external dependency

// compute sha256 of a BufferSource & return a lowercase hex string
export const sha256Hex = async (bytes: BufferSource): Promise<string> =>
{
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < view.length; i++)
  {
    hex += view[i].toString(16).padStart(2, '0')
  }
  return hex
}

// compute the sha256 of a Blob by reading its bytes. Blob.arrayBuffer() is
// widely supported & avoids pulling the whole file through a FileReader
export const sha256HexFromBlob = async (blob: Blob): Promise<string> =>
{
  const buffer = await blob.arrayBuffer()
  return sha256Hex(buffer)
}
