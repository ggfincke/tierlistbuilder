// src/shared/lib/binaryCodec.ts
// browser binary codecs for data URLs, base64, & object download helpers

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

// convert Uint8Array bytes into a base64 string w/ chunked string assembly
export const bytesToBase64 = (bytes: Uint8Array): string =>
{
  const parts: string[] = []
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize)
  {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    let binary = ''

    for (let j = 0; j < chunk.length; j++)
    {
      binary += String.fromCharCode(chunk[j])
    }

    parts.push(binary)
  }

  return btoa(parts.join(''))
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
