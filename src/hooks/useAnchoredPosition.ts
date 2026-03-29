// src/hooks/useAnchoredPosition.ts
// shared anchored positioning state for fixed overlays

import { useCallback, useState, type CSSProperties } from 'react'

interface UseAnchoredPositionOptions
{
  computePosition: () => CSSProperties | null
}

export const useAnchoredPosition = ({
  computePosition,
}: UseAnchoredPositionOptions) =>
{
  const [style, setStyle] = useState<CSSProperties>({})

  const updatePosition = useCallback(() =>
  {
    const nextStyle = computePosition()

    if (nextStyle)
    {
      setStyle(nextStyle)
    }
  }, [computePosition])

  return {
    style,
    updatePosition,
  }
}
