// convex/lib/imageValidation.ts
// image sniffing helpers — detect the real uploaded image type & dimensions

import {
  MAX_IMAGE_DIMENSION,
  type SupportedImageMimeType,
} from '@tierlistbuilder/contracts/platform/media'

export interface ParsedImageMetadata
{
  mimeType: SupportedImageMimeType
  width: number
  height: number
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

const hasAsciiAt = (
  bytes: Uint8Array,
  offset: number,
  value: string
): boolean =>
{
  if (offset + value.length > bytes.length)
  {
    return false
  }

  for (let i = 0; i < value.length; i++)
  {
    if (bytes[offset + i] !== value.charCodeAt(i))
    {
      return false
    }
  }

  return true
}

const readUint24LE = (view: DataView, offset: number): number =>
  view.getUint8(offset) |
  (view.getUint8(offset + 1) << 8) |
  (view.getUint8(offset + 2) << 16)

const assertDimensions = (width: number, height: number) =>
{
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  )
  {
    throw new Error(
      `image dimensions out of range: ${width}x${height} exceeds ${MAX_IMAGE_DIMENSION}`
    )
  }

  return { width, height }
}

const parsePng = (bytes: Uint8Array): ParsedImageMetadata | null =>
{
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    !hasAsciiAt(bytes, 1, 'PNG\r\n\x1a\n')
  )
  {
    return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    mimeType: 'image/png',
    ...assertDimensions(view.getUint32(16), view.getUint32(20)),
  }
}

const parseGif = (bytes: Uint8Array): ParsedImageMetadata | null =>
{
  if (
    bytes.length < 10 ||
    (!hasAsciiAt(bytes, 0, 'GIF87a') && !hasAsciiAt(bytes, 0, 'GIF89a'))
  )
  {
    return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    mimeType: 'image/gif',
    ...assertDimensions(view.getUint16(6, true), view.getUint16(8, true)),
  }
}

const parseWebp = (bytes: Uint8Array): ParsedImageMetadata | null =>
{
  if (
    bytes.length < 30 ||
    !hasAsciiAt(bytes, 0, 'RIFF') ||
    !hasAsciiAt(bytes, 8, 'WEBP')
  )
  {
    return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (hasAsciiAt(bytes, 12, 'VP8X'))
  {
    return {
      mimeType: 'image/webp',
      ...assertDimensions(
        readUint24LE(view, 24) + 1,
        readUint24LE(view, 27) + 1
      ),
    }
  }

  if (hasAsciiAt(bytes, 12, 'VP8 '))
  {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a)
    {
      return null
    }

    return {
      mimeType: 'image/webp',
      ...assertDimensions(
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff
      ),
    }
  }

  if (hasAsciiAt(bytes, 12, 'VP8L'))
  {
    if (bytes[20] !== 0x2f)
    {
      return null
    }

    const bits = view.getUint32(21, true)
    return {
      mimeType: 'image/webp',
      ...assertDimensions((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1),
    }
  }

  return null
}

const parseJpeg = (bytes: Uint8Array): ParsedImageMetadata | null =>
{
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
  {
    return null
  }

  let offset = 2
  while (offset + 1 < bytes.length)
  {
    if (bytes[offset] !== 0xff)
    {
      offset++
      continue
    }

    while (offset < bytes.length && bytes[offset] === 0xff)
    {
      offset++
    }
    if (offset >= bytes.length)
    {
      return null
    }

    const marker = bytes[offset]
    offset++

    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    )
    {
      continue
    }

    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length)
    {
      return null
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1]
    if (segmentLength < 2 || offset + segmentLength > bytes.length)
    {
      return null
    }

    if (SOF_MARKERS.has(marker))
    {
      if (segmentLength < 7)
      {
        return null
      }

      return {
        mimeType: 'image/jpeg',
        ...assertDimensions(
          (bytes[offset + 5] << 8) | bytes[offset + 6],
          (bytes[offset + 3] << 8) | bytes[offset + 4]
        ),
      }
    }

    offset += segmentLength
  }

  return null
}

export const parseUploadedImageMetadata = (
  bytes: Uint8Array
): ParsedImageMetadata =>
{
  const parsed =
    parsePng(bytes) ?? parseGif(bytes) ?? parseWebp(bytes) ?? parseJpeg(bytes)

  if (!parsed)
  {
    throw new Error('unsupported or malformed image payload')
  }

  return parsed
}
