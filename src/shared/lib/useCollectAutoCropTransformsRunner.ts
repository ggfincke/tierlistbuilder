// src/shared/lib/useCollectAutoCropTransformsRunner.ts
// cancellable batch runner for auto-crop transform collection

import { useCallback, useState } from 'react'

import type { TierItem } from '@tierlistbuilder/contracts/workspace/board'
import { useAbortControllerHandle } from '~/shared/hooks/useAbortControllerHandle'
import {
  collectAutoCropTransforms,
  type AutoCropTransformEntry,
} from './autoCrop'
import { isAbortError } from './errors'

export interface AutoCropProgress
{
  running: boolean
  done: number
  total: number
}

interface CollectAutoCropTransformsRunParams
{
  targets: readonly TierItem[]
  boardAspectRatio: number
  trimSoftShadows: boolean
  onError?: (error: unknown) => void
}

const EMPTY_PROGRESS: AutoCropProgress = { running: false, done: 0, total: 0 }

export const useCollectAutoCropTransformsRunner = (): {
  abort: () => void
  progress: AutoCropProgress
  run: (
    params: CollectAutoCropTransformsRunParams
  ) => Promise<AutoCropTransformEntry[] | null>
} =>
{
  const abortController = useAbortControllerHandle()
  const [progress, setProgress] = useState<AutoCropProgress>(EMPTY_PROGRESS)

  const abort = useCallback(() =>
  {
    abortController.abort()
    setProgress(EMPTY_PROGRESS)
  }, [abortController])

  const run = useCallback(
    async ({
      targets,
      boardAspectRatio,
      trimSoftShadows,
      onError,
    }: CollectAutoCropTransformsRunParams) =>
    {
      if (targets.length === 0) return null
      const controller = abortController.begin()
      setProgress({ running: true, done: 0, total: targets.length })
      try
      {
        const entries = await collectAutoCropTransforms({
          targets,
          boardAspectRatio,
          trimSoftShadows,
          signal: controller.signal,
          onProgress: () =>
            setProgress((p) => (p.running ? { ...p, done: p.done + 1 } : p)),
        })
        if (controller.signal.aborted) return null
        return entries
      }
      catch (error)
      {
        if (isAbortError(error)) return null
        if (onError)
        {
          onError(error)
          return null
        }
        throw error
      }
      finally
      {
        if (abortController.clear(controller)) setProgress(EMPTY_PROGRESS)
      }
    },
    [abortController]
  )

  return { abort, progress, run }
}
