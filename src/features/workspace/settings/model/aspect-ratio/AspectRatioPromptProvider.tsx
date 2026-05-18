// src/features/workspace/settings/model/aspect-ratio/AspectRatioPromptProvider.tsx
// provider component for the mixed-ratio prompt context

import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  AspectRatioPromptContext,
  type AspectRatioPromptController,
} from '~/features/workspace/settings/model/aspect-ratio/aspectRatioPromptContext'
import { shouldOpenAspectRatioPromptAfterImport } from '~/features/workspace/settings/model/aspect-ratio/aspectRatioPromptImport'

export const AspectRatioPromptProvider = ({
  children,
}: {
  children: ReactNode
}) =>
{
  const [isOpen, setIsOpen] = useState(false)
  const addItems = useActiveBoardStore((s) => s.addItems)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  const importWithPromptCheck = useCallback(
    (newItems: NewTierItem[]) =>
    {
      if (newItems.length === 0) return
      const prevState = useActiveBoardStore.getState()
      addItems(newItems)
      const nextState = useActiveBoardStore.getState()
      if (shouldOpenAspectRatioPromptAfterImport(prevState, nextState))
      {
        setIsOpen(true)
      }
    },
    [addItems]
  )

  const value = useMemo<AspectRatioPromptController>(
    () => ({ isOpen, open, close, importWithPromptCheck }),
    [isOpen, open, close, importWithPromptCheck]
  )

  return (
    <AspectRatioPromptContext.Provider value={value}>
      {children}
    </AspectRatioPromptContext.Provider>
  )
}
