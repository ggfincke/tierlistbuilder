// src/features/workspace/settings/model/useDeferredAspectRatioPicker.ts
// modal-only picker that keeps ratio/mode choices local until commit so the
// board behind the modal stays stable while the user cycles options

import { useCallback, useMemo, useState } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  computeAutoBoardAspectRatio,
  CUSTOM_RATIO_OPTION,
  getBoardAspectRatioMode,
  getBoardItemAspectRatio,
  isValidCustomDim,
  ratioOptionForBoard,
  resolveCustomRatioSeed,
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

interface CustomRatioInputs
{
  width: string
  height: string
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

    // prefill custom inputs from the board ratio so the always-visible row
    // reads as meaningful values instead of empty placeholders
    const [custom, setCustom] = useState<CustomRatioInputs>(() =>
      resolveCustomRatioSeed(
        getBoardItemAspectRatio(useActiveBoardStore.getState())
      )
    )
    const [customOpen, setCustomOpen] = useState(
      selectedOption === CUSTOM_RATIO_OPTION
    )

    const setCustomWidth = useCallback(
      (width: string) => setCustom((c) => ({ ...c, width })),
      []
    )
    const setCustomHeight = useCallback(
      (height: string) => setCustom((c) => ({ ...c, height })),
      []
    )

    const handleOption = useCallback(
      (option: RatioOption) =>
      {
        if (option.kind === 'auto')
        {
          const nextRatio = resolvePendingAutoAspectRatio(
            useActiveBoardStore.getState(),
            pendingRatio
          )
          setPendingRatio(nextRatio)
          setPendingMode('auto')
          setCustomOpen(false)
          setCustom(resolveCustomRatioSeed(nextRatio))
          return
        }
        if (option.kind === 'preset' && option.value != null)
        {
          setPendingMode('manual')
          setPendingRatio(option.value)
          setCustomOpen(false)
          setCustom(resolveCustomRatioSeed(option.value))
          return
        }
        setCustomOpen(true)
      },
      [pendingRatio]
    )

    const canApplyCustom =
      isValidCustomDim(custom.width) && isValidCustomDim(custom.height)

    const applyCustom = useCallback(() =>
    {
      if (!canApplyCustom) return
      const value = Number(custom.width) / Number(custom.height)
      if (!Number.isFinite(value) || value <= 0) return
      setPendingMode('manual')
      setPendingRatio(value)
    }, [canApplyCustom, custom.width, custom.height])

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
      customWidth: custom.width,
      customHeight: custom.height,
      setCustomWidth,
      setCustomHeight,
      customOpen,
      handleOption,
      applyCustom,
      canApplyCustom,
      commit,
    }
  }
