// src/features/workspace/imageEditor/model/transform/useArrowKeyNudge.ts
// arrow-key pan nudging for the image editor preview

import { useEffect } from 'react'

import { isInteractiveArrowTarget } from '../../lib/imageEditorGeometry'
import { nudgeImageEditorTransformByPixels } from '../../lib/imageEditorTransformOps'
import type { ImageEditorTransformDraftSetter } from '../transform/useImageEditorTransformDraft'

interface UseArrowKeyNudgeInput
{
  canvasHeight: number
  canvasWidth: number
  enabled: boolean
  setWorkingDraft: ImageEditorTransformDraftSetter
}

export const useArrowKeyNudge = ({
  canvasHeight,
  canvasWidth,
  enabled,
  setWorkingDraft,
}: UseArrowKeyNudgeInput): void =>
{
  useEffect(() =>
  {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) =>
    {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return
      if (isInteractiveArrowTarget(event.target)) return
      let dxPx = 0
      let dyPx = 0
      switch (event.key)
      {
        case 'ArrowLeft':
          dxPx = -1
          break
        case 'ArrowRight':
          dxPx = 1
          break
        case 'ArrowUp':
          dyPx = -1
          break
        case 'ArrowDown':
          dyPx = 1
          break
        default:
          return
      }
      if (event.shiftKey)
      {
        dxPx *= 10
        dyPx *= 10
      }
      event.preventDefault()
      setWorkingDraft((working) =>
        nudgeImageEditorTransformByPixels(
          working,
          dxPx,
          dyPx,
          canvasWidth,
          canvasHeight
        )
      )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, canvasWidth, canvasHeight, setWorkingDraft])
}
