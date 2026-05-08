// src/shared/sharing/snapshotCompression.ts
// snapshot compression client w/ worker acceleration & inline fallback

import type {
  BoardSnapshot,
  BoardSnapshotWire,
} from '@tierlistbuilder/contracts/workspace/board'
import { MAX_INFLATED_SNAPSHOT_BYTES } from '@tierlistbuilder/contracts/platform/shortLink'
import { loadCompressionLib } from '~/shared/lib/lazyDependencies'

type CompressionWorkerRequestInput =
  | {
      kind: 'compress'
      data: BoardSnapshot | BoardSnapshotWire
    }
  | {
      kind: 'inflate'
      compressed: Uint8Array
      maxInflatedBytes: number
    }

type CompressionWorkerRequest = CompressionWorkerRequestInput & { id: number }

type CompressionWorkerResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: true; json: string }
  | { id: number; ok: false; error: string }

interface CompressionWorkerJob
{
  resolve: (value: CompressionWorkerResponse) => void
  reject: (error: Error) => void
}

let compressionWorker: Worker | null = null
let compressionWorkerUnavailable = false
let compressionWorkerJobId = 0
const compressionWorkerJobs = new Map<number, CompressionWorkerJob>()

const rejectCompressionWorkerJobs = (error: Error): void =>
{
  for (const job of compressionWorkerJobs.values())
  {
    job.reject(error)
  }
  compressionWorkerJobs.clear()
}

const disposeCompressionWorker = (error: Error): void =>
{
  compressionWorkerUnavailable = true
  compressionWorker?.terminate()
  compressionWorker = null
  rejectCompressionWorkerJobs(error)
}

const getCompressionWorker = (): Worker | null =>
{
  if (
    compressionWorkerUnavailable ||
    typeof window === 'undefined' ||
    typeof Worker === 'undefined'
  )
  {
    return null
  }

  if (compressionWorker)
  {
    return compressionWorker
  }

  try
  {
    compressionWorker = new Worker(
      new URL('./compressionWorker.ts', import.meta.url),
      { type: 'module' }
    )
  }
  catch
  {
    compressionWorkerUnavailable = true
    return null
  }

  compressionWorker.onmessage = (
    event: MessageEvent<CompressionWorkerResponse>
  ) =>
  {
    const response = event.data
    const job = compressionWorkerJobs.get(response.id)
    if (!job) return
    compressionWorkerJobs.delete(response.id)
    job.resolve(response)
  }
  compressionWorker.onerror = () =>
    disposeCompressionWorker(new Error('snapshot compression worker failed'))
  compressionWorker.onmessageerror = () =>
    disposeCompressionWorker(
      new Error('snapshot compression worker message failed')
    )

  return compressionWorker
}

const runCompressionWorker = (
  request: CompressionWorkerRequestInput
): Promise<CompressionWorkerResponse> | null =>
{
  const worker = getCompressionWorker()
  if (!worker) return null

  const id = ++compressionWorkerJobId
  return new Promise((resolve, reject) =>
  {
    compressionWorkerJobs.set(id, { resolve, reject })
    try
    {
      worker.postMessage({ ...request, id } as CompressionWorkerRequest)
    }
    catch (error)
    {
      compressionWorkerJobs.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

const compressSnapshotPayloadBytesInline = async (
  data: BoardSnapshot | BoardSnapshotWire
): Promise<Uint8Array> =>
{
  const json = JSON.stringify(data)
  const bytes = new TextEncoder().encode(json)
  const { deflate } = await loadCompressionLib()
  return deflate(bytes)
}

const inflateSnapshotJsonInline = async (
  compressed: Uint8Array
): Promise<string> =>
{
  const { Inflate } = await loadCompressionLib()
  const inflator = new Inflate()
  const defaultOnData = inflator.onData.bind(inflator)
  let totalLength = 0
  let abortedForSize = false

  inflator.onData = (chunk: Uint8Array) =>
  {
    if (abortedForSize) return
    totalLength += chunk.length
    if (totalLength > MAX_INFLATED_SNAPSHOT_BYTES)
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
      `inflated snapshot exceeds the ${MAX_INFLATED_SNAPSHOT_BYTES}-byte cap`
    )
  }
  if (inflator.err)
  {
    throw new Error(`snapshot decompression failed: ${inflator.msg}`)
  }

  return new TextDecoder().decode(inflator.result as Uint8Array)
}

export const compressSnapshotPayloadBytes = async (
  data: BoardSnapshot | BoardSnapshotWire
): Promise<Uint8Array> =>
{
  const workerResult = await runCompressionWorker({
    kind: 'compress',
    data,
  })?.catch(() => null)

  if (workerResult?.ok && 'bytes' in workerResult)
  {
    return workerResult.bytes
  }

  return compressSnapshotPayloadBytesInline(data)
}

export const inflateSnapshotJson = async (
  compressed: Uint8Array
): Promise<string> =>
{
  const workerResult = await runCompressionWorker({
    kind: 'inflate',
    compressed,
    maxInflatedBytes: MAX_INFLATED_SNAPSHOT_BYTES,
  })?.catch(() => null)

  if (workerResult?.ok && 'json' in workerResult)
  {
    return workerResult.json
  }

  return inflateSnapshotJsonInline(compressed)
}
