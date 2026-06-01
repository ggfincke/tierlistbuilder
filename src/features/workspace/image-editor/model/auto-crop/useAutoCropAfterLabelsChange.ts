// src/features/workspace/image-editor/model/auto-crop/useAutoCropAfterLabelsChange.ts
// reruns active bulk auto-crop previews after caption visibility changes

import { useCallback, useEffect, useRef } from 'react'

import type { BoardLabelSettings } from '@tierlistbuilder/contracts/workspace/board'
import { withBoardShowLabels } from '~/shared/board-ui/labelSettings'

interface UseAutoCropAfterLabelsChangeInput
{
  boardLabels: BoardLabelSettings | undefined
  setBoardLabelSettings: (settings: BoardLabelSettings | null) => void
  shouldRerunAutoCrop: boolean
  onCancelAutoCrop: () => void
  canRunAutoCrop: boolean
  onRunAutoCrop: () => void
  clearPendingRerun?: boolean
}

export const useAutoCropAfterLabelsChange = ({
  boardLabels,
  setBoardLabelSettings,
  shouldRerunAutoCrop,
  onCancelAutoCrop,
  canRunAutoCrop,
  onRunAutoCrop,
  clearPendingRerun = false,
}: UseAutoCropAfterLabelsChangeInput) =>
{
  const rerunAutoCropAfterLabelChangeRef = useRef(false)

  const handleShowLabelsChange = useCallback(
    (show: boolean) =>
    {
      if (shouldRerunAutoCrop)
      {
        rerunAutoCropAfterLabelChangeRef.current = true
        onCancelAutoCrop()
      }
      setBoardLabelSettings(withBoardShowLabels(boardLabels, show))
    },
    [boardLabels, onCancelAutoCrop, setBoardLabelSettings, shouldRerunAutoCrop]
  )

  useEffect(() =>
  {
    if (!rerunAutoCropAfterLabelChangeRef.current) return
    if (clearPendingRerun)
    {
      rerunAutoCropAfterLabelChangeRef.current = false
      return
    }
    if (!canRunAutoCrop) return

    rerunAutoCropAfterLabelChangeRef.current = false
    onRunAutoCrop()
  }, [canRunAutoCrop, clearPendingRerun, onRunAutoCrop])

  return handleShowLabelsChange
}
