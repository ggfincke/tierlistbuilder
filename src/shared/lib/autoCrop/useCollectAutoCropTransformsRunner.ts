// src/shared/lib/autoCrop/useCollectAutoCropTransformsRunner.ts
// cancellable batch runner for auto-crop transform collection

import { useCallback, useState } from 'react'

import type { TierItem } from '@tierlistbuilder/contracts/workspace/board'
import { useAbortControllerHandle } from '~/shared/hooks/useAbortControllerHandle'
import {
  collectAutoCropTransforms,
  type AutoCropTransformEntry,
} from '~/shared/lib/autoCrop/pipeline'
import { isAbortError } from '~/shared/lib/errors'

export interface AutoCropProgress
{
  running: boolean
  done: number
  total: number
}

interface CollectAutoCropTransformsRunParams
{
  targets: readonly TierItem[]
  // label-aware crop callers resolve this per item
  getBoardAspectRatio: (item: TierItem) => number
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
      getBoardAspectRatio,
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
          getBoardAspectRatio,
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
