// src/features/workspace/settings/model/aspect-ratio/useAspectRatioPromptState.ts
// state controller for the mixed-ratio prompt quick-fix flow

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { getBlobsBatch } from '~/shared/images/imageStore'
import { getAutoCropImageRef } from '~/shared/lib/autoCrop'
import { isAbortError } from '~/shared/lib/errors'
import { logger } from '~/shared/lib/logger'
import { sleep, withTimeout } from '~/shared/lib/promise'
import type { RatioOption } from '~/shared/board-ui/aspectRatio'
import { useAutoCropController } from '../auto-crop/useAutoCropController'

interface UseAspectRatioPromptStateInput
{
  autoCropGeometryReady: boolean
  boardAspectRatio: number
  cleanupTargets: readonly TierItem[]
  getBoardAspectRatioForItem: (item: TierItem) => number
  handleOption: (option: RatioOption) => void
  mismatched: readonly TierItem[]
  openingMismatchCount: number
  trimSoftShadows: boolean
}

const AUTO_CROP_BLOB_READY_RETRY_MS = 150
const AUTO_CROP_BLOB_READY_TIMEOUT_MS = 3_000
const AUTO_CROP_BLOB_READY_POLL_TIMEOUT_MS = 750

interface AutoCropReadinessState
{
  key: string
  settled: boolean
}

export const useAspectRatioPromptState = ({
  autoCropGeometryReady,
  boardAspectRatio,
  cleanupTargets,
  getBoardAspectRatioForItem,
  handleOption,
  mismatched,
  openingMismatchCount,
  trimSoftShadows,
}: UseAspectRatioPromptStateInput) =>
{
  const {
    setAspectRatioPromptDismissed,
    setDefaultItemImageFit,
    setItemsImageFit,
    setItemsTransform,
  } = useActiveBoardStore(
    useShallow((s) => ({
      setAspectRatioPromptDismissed: s.setAspectRatioPromptDismissed,
      setDefaultItemImageFit: s.setDefaultItemImageFit,
      setItemsImageFit: s.setItemsImageFit,
      setItemsTransform: s.setItemsTransform,
    }))
  )

  const autoCropCandidateTargets = useMemo(
    () => cleanupTargets.filter((item) => !!getAutoCropImageRef(item)?.hash),
    [cleanupTargets]
  )

  const autoCropCandidateHashes = useMemo(() =>
  {
    const hashes: string[] = []
    const seen = new Set<string>()
    for (const item of autoCropCandidateTargets)
    {
      const hash = getAutoCropImageRef(item)?.hash
      if (!hash || seen.has(hash)) continue
      seen.add(hash)
      hashes.push(hash)
    }
    return hashes
  }, [autoCropCandidateTargets])
  const autoCropReadinessKey = autoCropCandidateHashes.join('|')
  const [autoCropReadiness, setAutoCropReadiness] =
    useState<AutoCropReadinessState>(() => ({
      key: '',
      settled: false,
    }))
  const [pendingBulkFit, setPendingBulkFit] = useState<ImageFit | null>(() =>
  {
    if (cleanupTargets.length === 0) return null
    if (autoCropCandidateTargets.length > 0) return null
    return 'cover'
  })
  const [dontAskAgain, setDontAskAgain] = useState(false)

  useEffect(() =>
  {
    if (autoCropCandidateHashes.length === 0) return

    const pollController = new AbortController()
    const { signal } = pollController
    const poll = async (): Promise<void> =>
    {
      const deadline = Date.now() + AUTO_CROP_BLOB_READY_TIMEOUT_MS
      let readyHashes = new Set<string>()

      while (!signal.aborted)
      {
        const readController = new AbortController()
        const abortRead = (): void =>
          readController.abort(
            signal.reason ??
              new DOMException(
                'Auto-crop blob readiness poll aborted.',
                'AbortError'
              )
          )
        if (signal.aborted) abortRead()
        else signal.addEventListener('abort', abortRead, { once: true })

        let records: Awaited<ReturnType<typeof getBlobsBatch>> | null = null
        try
        {
          records = await withTimeout(
            getBlobsBatch(autoCropCandidateHashes, {
              signal: readController.signal,
            }),
            AUTO_CROP_BLOB_READY_POLL_TIMEOUT_MS,
            {
              mode: 'resolveNull',
              onTimeout: () =>
                readController.abort(
                  new DOMException(
                    'Auto-crop blob readiness poll timed out.',
                    'AbortError'
                  )
                ),
            }
          )
        }
        catch (error)
        {
          if (isAbortError(error))
          {
            if (signal.aborted) return
            records = null
          }
          else
          {
            throw error
          }
        }
        finally
        {
          signal.removeEventListener('abort', abortRead)
        }

        if (signal.aborted) return
        if (records)
        {
          readyHashes = new Set<string>()
          for (const hash of autoCropCandidateHashes)
          {
            if (records.get(hash)) readyHashes.add(hash)
          }
          if (readyHashes.size === autoCropCandidateHashes.length) break
        }
        if (Date.now() >= deadline) break
        await sleep(AUTO_CROP_BLOB_READY_RETRY_MS, signal)
      }

      if (!signal.aborted)
      {
        setAutoCropReadiness({
          key: autoCropReadinessKey,
          settled: true,
        })
        if (readyHashes.size === 0) setPendingBulkFit((fit) => fit ?? 'cover')
      }
    }

    void poll().catch((error) =>
    {
      if (isAbortError(error)) return
      logger.warn('autoCrop', 'blob readiness poll failed', error)
      if (signal.aborted) return
      setAutoCropReadiness({
        key: autoCropReadinessKey,
        settled: true,
      })
      setPendingBulkFit((fit) => fit ?? 'cover')
    })
    return () =>
    {
      pollController.abort()
    }
  }, [autoCropCandidateHashes, autoCropReadinessKey])

  const autoCropReadinessSettled =
    autoCropCandidateHashes.length === 0 ||
    (autoCropReadiness.key === autoCropReadinessKey &&
      autoCropReadiness.settled)
  const autoCropPreparing =
    autoCropCandidateTargets.length > 0 &&
    (!autoCropReadinessSettled || !autoCropGeometryReady)
  const autoCropTargets = useMemo(
    () => (autoCropPreparing ? [] : autoCropCandidateTargets),
    [autoCropCandidateTargets, autoCropPreparing]
  )

  const autoCrop = useAutoCropController({
    boardAspectRatio,
    cleanupTargets,
    currentMismatchItems: mismatched,
    getBoardAspectRatioForItem,
    openingMismatchCount,
    pendingBulkFit,
    setItemsTransform,
    setPendingBulkFit,
    targets: autoCropTargets,
    trimSoftShadows,
  })

  // Run prompt-open auto-crop as a one-shot default, not user intent.
  // Do not call run(); it reintroduces 2:3 -> 1:1 bulk crop regressions.
  // Change only w/ explicit product clarification on ratio-chip behavior.
  const didAutoStartAutoCropRef = useRef(false)
  useEffect(() =>
  {
    if (didAutoStartAutoCropRef.current) return
    if (pendingBulkFit !== null || autoCropPreparing) return
    if (!autoCrop.available) return
    if (autoCrop.applied || autoCrop.progress.running) return
    didAutoStartAutoCropRef.current = true
    autoCrop.runAutoDefault()
  }, [autoCrop, autoCropPreparing, pendingBulkFit])

  const commitPendingFit = useCallback(() =>
  {
    if (pendingBulkFit !== null)
    {
      const ids = cleanupTargets.map((item) => item.id)
      setItemsImageFit(ids, pendingBulkFit)
      // pin the board default so later imports inherit the same fit
      setDefaultItemImageFit(pendingBulkFit)
    }
    if (dontAskAgain) setAspectRatioPromptDismissed(true)
  }, [
    pendingBulkFit,
    cleanupTargets,
    setItemsImageFit,
    setDefaultItemImageFit,
    dontAskAgain,
    setAspectRatioPromptDismissed,
  ])

  const handleSelectFit = useCallback(
    (fit: ImageFit) =>
    {
      autoCrop.clearPreview('fit')
      setPendingBulkFit(fit)
    },
    [autoCrop]
  )

  const handleRatioOption = useCallback(
    (option: RatioOption) =>
    {
      // Cancel auto-crop before board ratio changes.
      // Expanded mismatch sets must not inherit stale auto-crop previews.
      // Change only w/ explicit clarification on modal ratio flow.
      if (autoCrop.selected)
      {
        autoCrop.clearPreview('ratio')
        setPendingBulkFit(cleanupTargets.length > 0 ? 'cover' : null)
      }
      handleOption(option)
    },
    [autoCrop, cleanupTargets.length, handleOption]
  )

  return {
    autoCrop,
    autoCropPreparing,
    commitPendingFit,
    dontAskAgain,
    handleRatioOption,
    handleSelectFit,
    pendingBulkFit,
    setDontAskAgain,
  }
}
