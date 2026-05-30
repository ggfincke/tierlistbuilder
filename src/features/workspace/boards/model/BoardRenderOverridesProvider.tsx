// src/features/workspace/boards/model/BoardRenderOverridesProvider.tsx
// provider for non-persisted board render overrides

import { useMemo, type ReactNode } from 'react'
import {
  BoardRenderOverridesContext,
  type BoardRenderOverrides,
} from '~/features/workspace/boards/model/boardRenderOverrides'

interface BoardRenderOverridesProviderProps extends BoardRenderOverrides
{
  children: ReactNode
}

export const BoardRenderOverridesProvider = ({
  children,
  itemSize = null,
}: BoardRenderOverridesProviderProps) =>
{
  const value = useMemo(() => ({ itemSize }), [itemSize])
  return (
    <BoardRenderOverridesContext.Provider value={value}>
      {children}
    </BoardRenderOverridesContext.Provider>
  )
}
