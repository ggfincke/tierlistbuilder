// src/features/workspace/imageEditor/model/auto-crop/useImageEditorAutoCropItem.ts
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
import { useAbortControllerHandle } from '~/shared/hooks/useAbortControllerHandle'
import { useImageUrl } from '~/shared/hooks/useImageUrl'
import {
  detectContentBBox,
  getAutoCropImageRef,
  getCachedBBox,
  loadAutoCropBlob,
  resolveAutoCropTransform,
} from '~/shared/lib/autoCrop'
import { isAbortError } from '~/shared/lib/errors'
import { isSameItemTransform } from '~/shared/lib/imageTransform'
import { useAutoCropCacheVersion } from '~/shared/lib/useAutoCropCache'
import type { ImageEditorTransformDraftSetter } from '~/features/workspace/imageEditor/model/transform/useImageEditorTransformDraft'

interface UseImageEditorAutoCropItemInput
{
  item: TierItem
  trimSoftShadows: boolean
  autoCropAspectRatio: number
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
  trimSoftShadows,
  autoCropAspectRatio,
  working,
  setWorkingDraft,
}: UseImageEditorAutoCropItemInput): {
  status: AutoCropStatus
  autoCrop: () => Promise<void>
} =>
{
  const [autoCropping, setAutoCropping] = useState(false)
  const mountedRef = useRef(true)
  const autoCropAbort = useAbortControllerHandle()
  const workingRotationRef = useRef(working.rotation)
  const autoCropHash = getAutoCropImageRef(item)?.hash
  const autoCropUrl = useImageUrl(autoCropHash)

  useLayoutEffect(() =>
  {
    workingRotationRef.current = working.rotation
  }, [working.rotation])

  useEffect(
    () => () =>
    {
      mountedRef.current = false
    },
    []
  )

  useAutoCropCacheVersion()
  const autoCropResult = getCachedBBox(autoCropHash, trimSoftShadows)

  useEffect(() =>
  {
    if (!autoCropHash || autoCropUrl) return
    void warmImageHashes([autoCropHash])
  }, [autoCropHash, autoCropUrl])

  const autoCropTransform = useMemo(
    () =>
      autoCropResult
        ? resolveAutoCropTransform(
            item,
            autoCropResult,
            autoCropAspectRatio,
            working.rotation
          )
        : null,
    [autoCropAspectRatio, autoCropResult, item, working.rotation]
  )
  const autoCropApplied =
    !!autoCropTransform && isSameItemTransform(working, autoCropTransform)

  const autoCrop = useCallback(async () =>
  {
    if (!autoCropHash || autoCropping) return
    const controller = autoCropAbort.begin()
    setAutoCropping(true)
    try
    {
      let bbox = getCachedBBox(autoCropHash, trimSoftShadows)
      if (bbox === undefined)
      {
        const record = await loadAutoCropBlob(
          getAutoCropImageRef(item),
          controller.signal
        )
        if (!record) return
        const result = await detectContentBBox(
          record.bytes,
          autoCropHash,
          trimSoftShadows,
          controller.signal
        )
        bbox = result.bbox
      }
      if (!bbox || !mountedRef.current || controller.signal.aborted) return
      setWorkingDraft(
        resolveAutoCropTransform(
          item,
          bbox,
          autoCropAspectRatio,
          workingRotationRef.current
        )
      )
    }
    catch (err)
    {
      if (!isAbortError(err)) throw err
    }
    finally
    {
      autoCropAbort.clear(controller)
      if (mountedRef.current) setAutoCropping(false)
    }
  }, [
    autoCropHash,
    trimSoftShadows,
    autoCropping,
    item,
    autoCropAspectRatio,
    setWorkingDraft,
    autoCropAbort,
  ])

  const status = resolveAutoCropStatus({
    autoCropHash,
    autoCropping,
    autoCropResult,
    autoCropApplied,
  })

  return { status, autoCrop }
}
