// src/shared/lib/sha256.ts
// sha256 helper — hex digest via SubtleCrypto, no external dependency

import { base64ToBytes } from './binaryCodec'

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

// upper bound on decoded data URL size — legacy inline board images should
// never approach this, but an attacker-crafted board could otherwise drive
// us to allocate gigabytes on a legacy import path
const MAX_DATA_URL_BYTES = 25 * 1024 * 1024

// decode a base64 data URL into its raw bytes. throws if the input is not a
// data: URL — callers must guard. used by the migration path to hash existing
// imageUrl strings without re-decoding the image
export const dataUrlToBytes = (dataUrl: string): Uint8Array =>
{
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0 || !dataUrl.startsWith('data:'))
  {
    throw new Error('not a data url')
  }

  const header = dataUrl.slice(0, commaIndex)
  const payload = dataUrl.slice(commaIndex + 1)

  // data URLs can be either base64-encoded or percent-encoded. the ';base64'
  // token in the header distinguishes them
  if (header.includes(';base64'))
  {
    // base64 inflates by ~4/3; reject before decoding so we never allocate
    // more than MAX_DATA_URL_BYTES worth of bytes
    if (payload.length > (MAX_DATA_URL_BYTES * 4) / 3)
    {
      throw new Error(
        `data URL exceeds size limit (${MAX_DATA_URL_BYTES} bytes)`
      )
    }
    return base64ToBytes(payload)
  }

  if (payload.length > MAX_DATA_URL_BYTES)
  {
    throw new Error(`data URL exceeds size limit (${MAX_DATA_URL_BYTES} bytes)`)
  }

  const decoded = decodeURIComponent(payload)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++)
  {
    bytes[i] = decoded.charCodeAt(i)
  }
  return bytes
}

// extract the MIME type from a data URL header (e.g. "image/png"). returns
// 'application/octet-stream' for malformed headers so callers always get a
// defined value
export const dataUrlMimeType = (dataUrl: string): string =>
{
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0 || !dataUrl.startsWith('data:'))
  {
    return 'application/octet-stream'
  }
  const header = dataUrl.slice(5, commaIndex)
  const semicolon = header.indexOf(';')
  return semicolon >= 0 ? header.slice(0, semicolon) : header
}
