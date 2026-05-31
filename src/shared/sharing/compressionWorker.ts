// src/shared/sharing/compressionWorker.ts
// worker-side snapshot compression for share codecs
// loaded by snapshotCompression via new URL(..., import.meta.url)

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import { deflate, Inflate } from 'pako'
import { inflateDeflatedJson } from './inflateJson'

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
      json: inflateDeflatedJson(request.compressed, {
        Inflate,
        maxInflatedBytes: request.maxInflatedBytes,
        decoder,
      }),
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
