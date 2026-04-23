// src/features/workspace/settings/model/useDeferredAspectRatioPicker.ts
// modal-only picker that keeps ratio/mode choices local until commit so the
// board behind the modal stays stable while the user cycles options

import { useCallback, useMemo, useState } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  computeAutoBoardAspectRatio,
  CUSTOM_RATIO_OPTION,
  formatCustomRatioDim,
  getBoardAspectRatioMode,
  getBoardItemAspectRatio,
  isValidCustomDim,
  ratioOptionForBoard,
  type RatioOption,
} from '~/features/workspace/boards/lib/aspectRatio'
import type { ItemAspectRatioMode } from '@tierlistbuilder/contracts/workspace/board'
import type { BoardAspectRatioPicker } from './useBoardAspectRatioPicker'

export const resolvePendingAutoAspectRatio = (
  board: Parameters<typeof computeAutoBoardAspectRatio>[0],
  fallbackRatio: number
): number => computeAutoBoardAspectRatio(board) ?? fallbackRatio

export interface DeferredBoardAspectRatioPicker extends BoardAspectRatioPicker
{
  // apply pending ratio & mode to the store; callers invoke on confirm
  commit: () => void
}

export const useDeferredAspectRatioPicker =
  (): DeferredBoardAspectRatioPicker =>
  {
    const setBoardItemAspectRatio = useActiveBoardStore(
      (state) => state.setBoardItemAspectRatio
    )
    const setBoardAspectRatioMode = useActiveBoardStore(
      (state) => state.setBoardAspectRatioMode
    )

    // snapshot current board state on first render; picks update these locals
    // only, leaving the actual store untouched until commit()
    const [pendingRatio, setPendingRatio] = useState<number>(() =>
      getBoardItemAspectRatio(useActiveBoardStore.getState())
    )
    const [pendingMode, setPendingMode] = useState<ItemAspectRatioMode>(() =>
      getBoardAspectRatioMode(useActiveBoardStore.getState())
    )

    const selectedOption = useMemo(
      () => ratioOptionForBoard(pendingRatio, pendingMode),
      [pendingRatio, pendingMode]
    )

    // prefill custom inputs from the pending ratio so the always-visible row
    // reads as meaningful values instead of empty placeholders
    const [customWidth, setCustomWidth] = useState(() =>
      formatCustomRatioDim(
        getBoardItemAspectRatio(useActiveBoardStore.getState())
      )
    )
    const [customHeight, setCustomHeight] = useState('1')
    const [customOpen, setCustomOpen] = useState(
      selectedOption === CUSTOM_RATIO_OPTION
    )

    const handleOption = useCallback(
      (option: RatioOption) =>
      {
        if (option.kind === 'auto')
        {
          setPendingRatio(
            resolvePendingAutoAspectRatio(
              useActiveBoardStore.getState(),
              pendingRatio
            )
          )
          setPendingMode('auto')
          setCustomOpen(false)
          return
        }
        if (option.kind === 'preset' && option.value != null)
        {
          setPendingMode('manual')
          setPendingRatio(option.value)
          setCustomOpen(false)
          return
        }
        setCustomOpen(true)
        if (!customWidth && !customHeight)
        {
          setCustomWidth(formatCustomRatioDim(pendingRatio))
          setCustomHeight('1')
        }
      },
      [customWidth, customHeight, pendingRatio]
    )

    const canApplyCustom =
      isValidCustomDim(customWidth) && isValidCustomDim(customHeight)

    const applyCustom = useCallback(() =>
    {
      if (!canApplyCustom) return
      const value = Number(customWidth) / Number(customHeight)
      if (!Number.isFinite(value) || value <= 0) return
      setPendingMode('manual')
      setPendingRatio(value)
    }, [canApplyCustom, customWidth, customHeight])

    const commit = useCallback(() =>
    {
      if (pendingMode === 'auto')
      {
        setBoardAspectRatioMode('auto')
        return
      }
      // manual: push the pinned ratio; store's setter implicitly flips mode
      setBoardItemAspectRatio(pendingRatio)
    }, [
      pendingMode,
      pendingRatio,
      setBoardItemAspectRatio,
      setBoardAspectRatioMode,
    ])

    return {
      boardAspectRatio: pendingRatio,
      selectedOption,
      customWidth,
      customHeight,
      setCustomWidth,
      setCustomHeight,
      customOpen,
      handleOption,
      applyCustom,
      canApplyCustom,
      commit,
    }
  }
