// tests/convex/imageValidation.test.ts
// verify server-side image sniffing reads trusted metadata from bytes. each
// supported format gets at least one sniff & one reject (security boundary)

import { describe, expect, it } from 'vitest'
import { parseUploadedImageMetadata } from '../../convex/lib/imageValidation'

// build a minimal PNG IHDR header w/ the given dimensions
const buildPngHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  bytes[16] = (width >>> 24) & 0xff
  bytes[17] = (width >>> 16) & 0xff
  bytes[18] = (width >>> 8) & 0xff
  bytes[19] = width & 0xff
  bytes[20] = (height >>> 24) & 0xff
  bytes[21] = (height >>> 16) & 0xff
  bytes[22] = (height >>> 8) & 0xff
  bytes[23] = height & 0xff
  return bytes
}

// build a minimal GIF header (GIF89a + LE dims)
const buildGifHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(10)
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0)
  bytes[6] = width & 0xff
  bytes[7] = (width >>> 8) & 0xff
  bytes[8] = height & 0xff
  bytes[9] = (height >>> 8) & 0xff
  return bytes
}

// build a minimal JPEG w/ SOI + SOF0 segment carrying BE dims
const buildJpegHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(21)
  bytes.set([0xff, 0xd8], 0)
  bytes.set([0xff, 0xc0], 2)
  bytes.set([0x00, 0x11], 4)
  bytes[6] = 0x08
  bytes[7] = (height >>> 8) & 0xff
  bytes[8] = height & 0xff
  bytes[9] = (width >>> 8) & 0xff
  bytes[10] = width & 0xff
  return bytes
}

// build a minimal WebP w/ VP8X chunk (24-bit LE w-1 / h-1)
const buildWebpVp8xHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x58], 12)
  bytes[20] = 0x00
  const w = width - 1
  const h = height - 1
  bytes[24] = w & 0xff
  bytes[25] = (w >>> 8) & 0xff
  bytes[26] = (w >>> 16) & 0xff
  bytes[27] = h & 0xff
  bytes[28] = (h >>> 8) & 0xff
  bytes[29] = (h >>> 16) & 0xff
  return bytes
}

// build a minimal WebP w/ lossy VP8 chunk carrying masked 14-bit LE dims
const buildWebpVp8Header = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x20], 12)
  bytes[23] = 0x9d
  bytes[24] = 0x01
  bytes[25] = 0x2a
  bytes[26] = width & 0xff
  bytes[27] = (width >>> 8) & 0xff
  bytes[28] = height & 0xff
  bytes[29] = (height >>> 8) & 0xff
  return bytes
}

// build a minimal WebP w/ lossless VP8L chunk carrying packed 14+14 bit dims
const buildWebpVp8lHeader = (width: number, height: number): Uint8Array =>
{
  const bytes = new Uint8Array(30)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12)
  bytes[20] = 0x2f
  const packed = (width - 1) | ((height - 1) << 14)
  bytes[21] = packed & 0xff
  bytes[22] = (packed >>> 8) & 0xff
  bytes[23] = (packed >>> 16) & 0xff
  bytes[24] = (packed >>> 24) & 0xff
  return bytes
}

describe('parseUploadedImageMetadata', () =>
{
  it('reads png dimensions', () =>
  {
    expect(parseUploadedImageMetadata(buildPngHeader(64, 32))).toEqual({
      mimeType: 'image/png',
      width: 64,
      height: 32,
    })
  })

  it('reads gif dimensions (LE)', () =>
  {
    expect(parseUploadedImageMetadata(buildGifHeader(300, 200))).toEqual({
      mimeType: 'image/gif',
      width: 300,
      height: 200,
    })
  })

  it('reads jpeg dimensions (BE in SOF0)', () =>
  {
    expect(parseUploadedImageMetadata(buildJpegHeader(1024, 768))).toEqual({
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
    })
  })

  it('reads webp VP8X extended-format dimensions', () =>
  {
    expect(parseUploadedImageMetadata(buildWebpVp8xHeader(4096, 2048))).toEqual(
      {
        mimeType: 'image/webp',
        width: 4096,
        height: 2048,
      }
    )
  })

  it('reads webp VP8 lossy dimensions', () =>
  {
    expect(parseUploadedImageMetadata(buildWebpVp8Header(640, 480))).toEqual({
      mimeType: 'image/webp',
      width: 640,
      height: 480,
    })
  })

  it('reads webp VP8L lossless dimensions', () =>
  {
    expect(parseUploadedImageMetadata(buildWebpVp8lHeader(256, 128))).toEqual({
      mimeType: 'image/webp',
      width: 256,
      height: 128,
    })
  })

  it('rejects a completely malformed payload', () =>
  {
    expect(() => parseUploadedImageMetadata(new Uint8Array([1, 2, 3]))).toThrow(
      'unsupported or malformed image payload'
    )
  })

  it('rejects a PNG w/ a dimension past MAX_IMAGE_DIMENSION', () =>
  {
    const bytes = buildPngHeader(99_999, 10)
    expect(() => parseUploadedImageMetadata(bytes)).toThrow(
      /dimensions out of range/
    )
  })

  it('rejects a JPEG w/ a zero dimension', () =>
  {
    const bytes = buildJpegHeader(0, 10)
    expect(() => parseUploadedImageMetadata(bytes)).toThrow(
      /dimensions out of range/
    )
  })

  it('rejects a GIF w/ an unknown signature prefix', () =>
  {
    const bytes = buildGifHeader(16, 16)
    bytes[0] = 0x4a
    expect(() => parseUploadedImageMetadata(bytes)).toThrow(
      'unsupported or malformed image payload'
    )
  })

  it('rejects a WebP w/ a missing VP8 signature', () =>
  {
    const bytes = buildWebpVp8Header(64, 64)
    bytes[23] = 0x00
    expect(() => parseUploadedImageMetadata(bytes)).toThrow(
      'unsupported or malformed image payload'
    )
  })
})
