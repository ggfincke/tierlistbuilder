// src/features/workspace/settings/model/useBoardAspectRatioPicker.ts
// shared state + dispatch for the aspect-ratio picker used in modal & section

import { useCallback, useMemo, useState } from 'react'

import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import {
  CUSTOM_RATIO_OPTION,
  formatCustomRatioDim,
  getBoardAspectRatioMode,
  getBoardItemAspectRatio,
  isValidCustomDim,
  ratioOptionForBoard,
  type RatioOption,
} from '@/features/workspace/boards/lib/aspectRatio'

export interface BoardAspectRatioPicker
{
  boardAspectRatio: number
  selectedOption: RatioOption
  customWidth: string
  customHeight: string
  setCustomWidth: (v: string) => void
  setCustomHeight: (v: string) => void
  customOpen: boolean
  handleOption: (option: RatioOption) => void
  applyCustom: () => void
  canApplyCustom: boolean
}

export const useBoardAspectRatioPicker = (): BoardAspectRatioPicker =>
{
  const boardAspectRatio = useActiveBoardStore((state) =>
    getBoardItemAspectRatio(state)
  )
  const mode = useActiveBoardStore((state) => getBoardAspectRatioMode(state))
  const setBoardItemAspectRatio = useActiveBoardStore(
    (state) => state.setBoardItemAspectRatio
  )
  const setBoardAspectRatioMode = useActiveBoardStore(
    (state) => state.setBoardAspectRatioMode
  )

  const selectedOption = useMemo(
    () => ratioOptionForBoard(boardAspectRatio, mode),
    [boardAspectRatio, mode]
  )

  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')
  const [customOpen, setCustomOpen] = useState(
    selectedOption === CUSTOM_RATIO_OPTION
  )

  const handleOption = useCallback(
    (option: RatioOption) =>
    {
      if (option.kind === 'auto')
      {
        setBoardAspectRatioMode('auto')
        setCustomOpen(false)
        return
      }
      if (option.kind === 'preset' && option.value != null)
      {
        setBoardItemAspectRatio(option.value)
        setCustomOpen(false)
        return
      }
      setCustomOpen(true)
      if (!customWidth && !customHeight)
      {
        setCustomWidth(formatCustomRatioDim(boardAspectRatio))
        setCustomHeight('1')
      }
    },
    [
      setBoardAspectRatioMode,
      setBoardItemAspectRatio,
      boardAspectRatio,
      customWidth,
      customHeight,
    ]
  )

  const canApplyCustom =
    isValidCustomDim(customWidth) && isValidCustomDim(customHeight)

  const applyCustom = useCallback(() =>
  {
    if (!canApplyCustom) return
    const value = Number(customWidth) / Number(customHeight)
    if (!Number.isFinite(value) || value <= 0) return
    setBoardItemAspectRatio(value)
  }, [canApplyCustom, customWidth, customHeight, setBoardItemAspectRatio])

  return {
    boardAspectRatio,
    selectedOption,
    customWidth,
    customHeight,
    setCustomWidth,
    setCustomHeight,
    customOpen,
    handleOption,
    applyCustom,
    canApplyCustom,
  }
}
