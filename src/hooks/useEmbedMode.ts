// src/hooks/useEmbedMode.ts
// detect embed mode from the URL query parameter ?embed=true

import { useMemo } from 'react'

export const useEmbedMode = (): boolean =>
  useMemo(() =>
  {
    const params = new URLSearchParams(window.location.search)
    return params.get('embed') === 'true'
  }, [])
