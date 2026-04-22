// src/features/workspace/settings/model/AspectRatioPromptProvider.tsx
// provider component for the mixed-ratio prompt context

import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { hasAspectRatioIssues } from '~/features/workspace/boards/lib/aspectRatio'
import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'
import {
  AspectRatioPromptContext,
  type AspectRatioPromptController,
} from './aspectRatioPromptContext'

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
      const prevHadIssues = hasAspectRatioIssues(useActiveBoardStore.getState())
      addItems(newItems)
      const nextState = useActiveBoardStore.getState()
      if (
        !prevHadIssues &&
        !nextState.aspectRatioPromptDismissed &&
        hasAspectRatioIssues(nextState)
      )
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
