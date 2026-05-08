// src/shared/sharing/compressionWorker.ts
// worker-side snapshot compression for share codecs

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import { deflate, Inflate } from 'pako'

type CompressionWorkerRequest =
  | {
      id: number
      kind: 'compress'
      data: BoardSnapshot | BoardSnapshotWire
    }
  | {
      id: number
      kind: 'inflate'
      compressed: Uint8Array
      maxInflatedBytes: number
    }

type CompressionWorkerResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: true; json: string }
  | { id: number; ok: false; error: string }

interface CompressionWorkerScope
{
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<CompressionWorkerRequest>) => void
  ) => void
  postMessage: (
    message: CompressionWorkerResponse,
    transfer?: Transferable[]
  ) => void
}

const workerScope = self as unknown as CompressionWorkerScope
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const transferable = (bytes: Uint8Array): Transferable[] =>
  bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : []

const inflateToJson = (
  compressed: Uint8Array,
  maxInflatedBytes: number
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

workerScope.addEventListener('message', (event) =>
{
  const request = event.data

  try
  {
    if (request.kind === 'compress')
    {
      const bytes = deflate(encoder.encode(JSON.stringify(request.data)))
      workerScope.postMessage(
        { id: request.id, ok: true, bytes },
        transferable(bytes)
      )
      return
    }

    workerScope.postMessage({
      id: request.id,
      ok: true,
      json: inflateToJson(request.compressed, request.maxInflatedBytes),
    })
  }
  catch (error)
  {
    workerScope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
