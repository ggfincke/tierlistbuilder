// src/shared/lib/binaryCodec.ts
// browser binary codecs for data URLs, base64, & blob download helpers

// upper bound on decoded data URL size — inline board images should never
// approach this, but a crafted payload could otherwise drive us to
// allocate gigabytes on import
const MAX_DATA_URL_BYTES = 25 * 1024 * 1024

// convert a Blob into a data URL via FileReader
export const blobToDataUrl = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) =>
  {
    const reader = new FileReader()

    reader.onload = () =>
    {
      if (typeof reader.result === 'string')
      {
        resolve(reader.result)
      }
      else
      {
        reject(new Error('Failed to encode blob as data URL.'))
      }
    }

    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read blob.'))

    reader.readAsDataURL(blob)
  })

// convert Uint8Array bytes into a base64 string. chunk size is a multiple
// of 3 so btoa's partial-group '=' padding only appears on the final chunk
// — otherwise per-chunk base64 output would corrupt when concatenated
export const bytesToBase64 = (bytes: Uint8Array): string =>
{
  const CHUNK_SIZE = 32766
  let output = ''

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE)
  {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    let binary = ''

    for (let j = 0; j < chunk.length; j++)
    {
      binary += String.fromCharCode(chunk[j])
    }

    output += btoa(binary)
  }

  return output
}

// convert a base64 string into Uint8Array bytes
export const base64ToBytes = (base64: string): Uint8Array =>
{
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++)
  {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

// decode a base64 or percent-encoded data URL into its raw bytes. throws
// if the input is not a data: URL — callers must guard
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

  // TextEncoder preserves multi-byte chars; charCodeAt would truncate UTF-16
  // code units, corrupting non-ASCII content (emoji, CJK, accents)
  return new TextEncoder().encode(decodeURIComponent(payload))
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
