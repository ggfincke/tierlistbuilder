// tests/convex/imageValidation.test.ts
// server-side image sniffing: trusted metadata reads & format rejections

import { describe, expect, it } from 'vitest'
import { parseUploadedImageMetadata } from '../../convex/lib/imageValidation'

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
  it('reads dimensions for png, gif, jpeg, & webp (VP8X, VP8, VP8L)', () =>
  {
    expect(parseUploadedImageMetadata(buildPngHeader(64, 32))).toEqual({
      mimeType: 'image/png',
      width: 64,
      height: 32,
    })
    expect(parseUploadedImageMetadata(buildGifHeader(300, 200))).toEqual({
      mimeType: 'image/gif',
      width: 300,
      height: 200,
    })
    expect(parseUploadedImageMetadata(buildJpegHeader(1024, 768))).toEqual({
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
    })
    expect(parseUploadedImageMetadata(buildWebpVp8xHeader(4096, 2048))).toEqual(
      {
        mimeType: 'image/webp',
        width: 4096,
        height: 2048,
      }
    )
    expect(parseUploadedImageMetadata(buildWebpVp8Header(640, 480))).toEqual({
      mimeType: 'image/webp',
      width: 640,
      height: 480,
    })
    expect(parseUploadedImageMetadata(buildWebpVp8lHeader(256, 128))).toEqual({
      mimeType: 'image/webp',
      width: 256,
      height: 128,
    })
  })

  it('rejects malformed payloads, oversized dimensions, & missing format signatures', () =>
  {
    expect(() => parseUploadedImageMetadata(new Uint8Array([1, 2, 3]))).toThrow(
      'unsupported or malformed image payload'
    )

    expect(() =>
      parseUploadedImageMetadata(buildPngHeader(99_999, 10))
    ).toThrow(/dimensions out of range/)
    expect(() => parseUploadedImageMetadata(buildJpegHeader(0, 10))).toThrow(
      /dimensions out of range/
    )

    const badGif = buildGifHeader(16, 16)
    badGif[0] = 0x4a
    expect(() => parseUploadedImageMetadata(badGif)).toThrow(
      'unsupported or malformed image payload'
    )

    const badWebp = buildWebpVp8Header(64, 64)
    badWebp[23] = 0x00
    expect(() => parseUploadedImageMetadata(badWebp)).toThrow(
      'unsupported or malformed image payload'
    )
  })
})
