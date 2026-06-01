// src/features/workspace/image-editor/model/transform/useImageEditorPaddingDraft.ts
// plate-inset draft state, debounced autosave, & dirty tracking
// scalar sibling of the transform draft using useDebouncedDraft

import { useCallback, useLayoutEffect, useRef } from 'react'

import type { TierItem } from '@tierlistbuilder/contracts/workspace/board'
import { clampImagePadding } from '@tierlistbuilder/contracts/workspace/board'
import { getEffectiveImagePadding } from '~/shared/board-ui/aspectRatio'
import { useDebouncedDraft } from '~/features/workspace/image-editor/model/transform/useDebouncedDraft'

const AUTO_COMMIT_MS = 350
const EMPTY_PADDING_ITEM = { imagePadding: undefined } as const
const numbersEqual = (a: number, b: number): boolean => a === b

interface UseImageEditorPaddingDraftInput
{
  item: TierItem
  boardDefaultPadding: number | undefined
  // Whether a plate (backgroundColor / autoPlate) sits behind the image.
  // drives the no-override fallback in getEffectiveImagePadding
  hasPlate: boolean
  // commit an explicit per-item padding; null clears the override (inherit)
  onCommit: (padding: number | null) => void
}

export const useImageEditorPaddingDraft = ({
  item,
  boardDefaultPadding,
  hasPlate,
  onCommit,
}: UseImageEditorPaddingDraftInput) =>
{
  // value rendered when nothing is being edited (item override wins)
  const committed = getEffectiveImagePadding(
    item,
    boardDefaultPadding,
    hasPlate
  )
  // Value w/o per-item override: reset target & clear-override sentinel.
  const inherited = getEffectiveImagePadding(
    EMPTY_PADDING_ITEM,
    boardDefaultPadding,
    hasPlate
  )
  const hasExplicit = item.imagePadding != null

  // deferred readers (the draft's flush) need the latest inherited value & commit
  const inheritedRef = useRef(inherited)
  const onCommitRef = useRef(onCommit)
  useLayoutEffect(() =>
  {
    inheritedRef.current = inherited
    onCommitRef.current = onCommit
  })

  const handleFlush = useCallback((next: number) =>
  {
    // Store explicit value unless it matches inherited resolution.
    // Then clear the override so it tracks the board/plate default.
    onCommitRef.current(
      next === inheritedRef.current ? null : clampImagePadding(next)
    )
  }, [])

  const { working, setWorking, flush, cancel } = useDebouncedDraft<number>({
    committed,
    equals: numbersEqual,
    autoCommitMs: AUTO_COMMIT_MS,
    onFlush: handleFlush,
  })

  const setPaddingLive = useCallback(
    (value: number) => setWorking(clampImagePadding(value)),
    [setWorking]
  )

  // clear the override & snap back to the inherited resolution
  const resetPadding = useCallback(() =>
  {
    setWorking(inheritedRef.current)
    cancel()
    onCommitRef.current(null)
  }, [cancel, setWorking])

  return {
    workingPadding: working,
    setPaddingLive,
    resetPadding,
    hasPaddingChanges: hasExplicit || working !== inherited,
    flushPendingPadding: flush,
  }
}
