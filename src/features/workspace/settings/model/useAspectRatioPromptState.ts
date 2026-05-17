// src/features/workspace/settings/model/useAspectRatioPromptState.ts
// state controller for the mixed-ratio prompt quick-fix flow

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { ImageFit } from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { getAutoCropImageRef } from '~/shared/lib/autoCrop'
import type { RatioOption } from '~/shared/board-ui/aspectRatio'
import {
  createAspectRatioPromptSnapshot,
  resolveAspectRatioPromptItems,
} from './aspectRatioPromptSnapshot'
import { useAutoCropController } from './useAutoCropController'

interface UseAspectRatioPromptStateInput
{
  boardAspectRatio: number
  handleOption: (option: RatioOption) => void
  trimSoftShadows: boolean
}

export const useAspectRatioPromptState = ({
  boardAspectRatio,
  handleOption,
  trimSoftShadows,
}: UseAspectRatioPromptStateInput) =>
{
  const items = useActiveBoardStore((s) => s.items)
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

  // capture opening mismatch set at mount; cleanup keeps these ids even
  // if the picker ratio later resolves the mismatch before Done
  const [promptSnapshot] = useState(() =>
    createAspectRatioPromptSnapshot({
      items: useActiveBoardStore.getState().items,
      itemAspectRatio: boardAspectRatio,
    })
  )

  const { current: mismatched, cleanup: cleanupTargets } = useMemo(
    () =>
      resolveAspectRatioPromptItems(promptSnapshot, {
        items,
        itemAspectRatio: boardAspectRatio,
      }),
    [items, boardAspectRatio, promptSnapshot]
  )

  const autoCropTargets = useMemo(
    () => cleanupTargets.filter((item) => !!getAutoCropImageRef(item)),
    [cleanupTargets]
  )

  // stage bulk fit previews until Done / Adjust each
  // prefer auto-crop when image bytes exist; cover is fallback
  // strip stale transforms on Done when auto-crop can't run
  const [pendingBulkFit, setPendingBulkFit] = useState<ImageFit | null>(() =>
  {
    if (cleanupTargets.length === 0) return null
    if (autoCropTargets.length > 0) return null
    return 'cover'
  })
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const autoCrop = useAutoCropController({
    boardAspectRatio,
    cleanupTargets,
    currentMismatchItems: mismatched,
    openingMismatchCount: promptSnapshot.itemIds.length,
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
    if (!autoCrop.available) return
    if (autoCrop.applied || autoCrop.progress.running) return
    didAutoStartAutoCropRef.current = true
    autoCrop.runAutoDefault()
  }, [autoCrop])

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
    cleanupTargets,
    commitPendingFit,
    dontAskAgain,
    handleRatioOption,
    handleSelectFit,
    mismatched,
    pendingBulkFit,
    setDontAskAgain,
  }
}
