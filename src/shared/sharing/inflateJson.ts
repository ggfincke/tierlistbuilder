// src/shared/sharing/inflateJson.ts
// capped streaming inflate helper shared by inline & worker share decoders

import type { Inflate as PakoInflate } from 'pako'

type InflateConstructor = new () => PakoInflate

interface InflateDeflatedJsonOptions
{
  Inflate: InflateConstructor
  maxInflatedBytes: number
  decoder?: TextDecoder
}

export const inflateDeflatedJson = (
  compressed: Uint8Array,
  {
    Inflate,
    maxInflatedBytes,
    decoder = new TextDecoder(),
  }: InflateDeflatedJsonOptions
): string =>
{
  const inflator = new Inflate()
  const defaultOnData = inflator.onData.bind(inflator)
  let totalLength = 0
  let abortedForSize = false

  inflator.onData = (chunk: Uint8Array) =>
  {
    if (abortedForSize) return
    totalLength += chunk.length
    if (totalLength > maxInflatedBytes)
    {
      abortedForSize = true
      return
    }
    defaultOnData(chunk)
  }

  inflator.push(compressed, true)

  if (abortedForSize)
  {
    throw new Error(
      `inflated snapshot exceeds the ${maxInflatedBytes}-byte cap`
    )
  }

  if (inflator.err)
  {
    throw new Error(`snapshot decompression failed: ${inflator.msg}`)
  }

  return decoder.decode(inflator.result as Uint8Array)
}
