// src/hooks/useAnchoredPosition.ts
// shared anchored positioning state for fixed overlays

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

interface UseAnchoredPositionOptions
{
  computePosition: () => CSSProperties | null
}

export const useAnchoredPosition = ({
  computePosition,
}: UseAnchoredPositionOptions) =>
{
  const [style, setStyle] = useState<CSSProperties>({})
  const computeRef = useRef(computePosition)

  useEffect(() =>
  {
    computeRef.current = computePosition
  }, [computePosition])

  const updatePosition = useCallback(() =>
  {
    const nextStyle = computeRef.current()

    if (nextStyle)
    {
      setStyle(nextStyle)
    }
  }, [])

  return {
    style,
    updatePosition,
  }
}
