// src/features/workspace/imageEditor/model/useImageEditorAutoCropItem.ts
// single-item auto-crop cache, detection, & transform application state

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type {
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import { warmImageHashes } from '~/shared/images/imageBlobCache'
import {
  detectContentBBox,
  getAutoCropHash,
  getCachedBBox,
  loadAutoCropBlob,
  resolveAutoCropTransform,
} from '~/shared/lib/autoCrop'
import { isSameItemTransform } from '~/shared/lib/imageTransform'
import { useAutoCropCacheVersion } from '~/shared/lib/useAutoCropCache'
import type { ImageEditorTransformDraftSetter } from './useImageEditorTransformDraft'

interface UseImageEditorAutoCropItemInput
{
  item: TierItem
  sourceUrl: string | null
  trimSoftShadows: boolean
  frameAspectRatio: number
  working: ItemTransform
  setWorkingDraft: ImageEditorTransformDraftSetter
}

// status: 'unavailable' = no image hash; 'pending' = hash but no bbox yet;
// 'noContent' = detected w/ no usable bbox; 'cropping' = detect/apply in
// flight; 'ready'/'applied' = bbox detected, not-applied/applied to working
export type AutoCropStatus =
  | 'unavailable'
  | 'pending'
  | 'noContent'
  | 'cropping'
  | 'ready'
  | 'applied'

interface AutoCropStatusInputs
{
  autoCropHash: string | undefined
  autoCropping: boolean
  autoCropResult: ReturnType<typeof getCachedBBox>
  autoCropApplied: boolean
}

const resolveAutoCropStatus = (
  inputs: AutoCropStatusInputs
): AutoCropStatus =>
{
  if (!inputs.autoCropHash) return 'unavailable'
  if (inputs.autoCropping) return 'cropping'
  if (inputs.autoCropResult === undefined) return 'pending'
  if (inputs.autoCropResult === null) return 'noContent'
  return inputs.autoCropApplied ? 'applied' : 'ready'
}

export const useImageEditorAutoCropItem = ({
  item,
  sourceUrl,
  trimSoftShadows,
  frameAspectRatio,
  working,
  setWorkingDraft,
}: UseImageEditorAutoCropItemInput): {
  status: AutoCropStatus
  autoCrop: () => Promise<void>
} =>
{
  const [autoCropping, setAutoCropping] = useState(false)
  const mountedRef = useRef(true)
  const autoCropAbortRef = useRef<AbortController | null>(null)
  const workingRotationRef = useRef(working.rotation)
  const autoCropHash = getAutoCropHash(item)

  useLayoutEffect(() =>
  {
    workingRotationRef.current = working.rotation
  }, [working.rotation])

  useEffect(
    () => () =>
    {
      mountedRef.current = false
      autoCropAbortRef.current?.abort()
    },
    []
  )

  useAutoCropCacheVersion()
  const autoCropResult = getCachedBBox(autoCropHash, trimSoftShadows)

  useEffect(() =>
  {
    if (!item.sourceImageRef?.hash || sourceUrl) return
    void warmImageHashes([item.sourceImageRef.hash])
  }, [item.sourceImageRef?.hash, sourceUrl])

  const autoCropTransform = useMemo(
    () =>
      autoCropResult
        ? resolveAutoCropTransform(
            item,
            autoCropResult,
            frameAspectRatio,
            working.rotation
          )
        : null,
    [autoCropResult, frameAspectRatio, item, working.rotation]
  )
  const autoCropApplied =
    !!autoCropTransform && isSameItemTransform(working, autoCropTransform)

  const autoCrop = useCallback(async () =>
  {
    if (!autoCropHash || autoCropping) return
    autoCropAbortRef.current?.abort()
    const controller = new AbortController()
    autoCropAbortRef.current = controller
    setAutoCropping(true)
    try
    {
      let bbox = getCachedBBox(autoCropHash, trimSoftShadows)
      if (bbox === undefined)
      {
        const autoCropRef =
          item.sourceImageRef?.hash === autoCropHash
            ? item.sourceImageRef
            : item.imageRef
        const record = await loadAutoCropBlob(autoCropRef, controller.signal)
        if (!record) return
        bbox = await detectContentBBox(
          record.bytes,
          autoCropHash,
          trimSoftShadows,
          controller.signal
        )
      }
      if (!bbox || !mountedRef.current || controller.signal.aborted) return
      setWorkingDraft(
        resolveAutoCropTransform(
          item,
          bbox,
          frameAspectRatio,
          workingRotationRef.current
        )
      )
    }
    catch (err)
    {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
    }
    finally
    {
      if (autoCropAbortRef.current === controller)
      {
        autoCropAbortRef.current = null
      }
      if (mountedRef.current) setAutoCropping(false)
    }
  }, [
    autoCropHash,
    trimSoftShadows,
    autoCropping,
    item,
    frameAspectRatio,
    setWorkingDraft,
  ])

  const status = resolveAutoCropStatus({
    autoCropHash,
    autoCropping,
    autoCropResult,
    autoCropApplied,
  })

  return { status, autoCrop }
}
