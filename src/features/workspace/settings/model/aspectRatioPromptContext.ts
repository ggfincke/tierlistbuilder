// src/features/workspace/settings/model/aspectRatioPromptContext.ts
// context object + controller type for the mixed-ratio prompt modal

import { createContext } from 'react'

import type { NewTierItem } from '@tierlistbuilder/contracts/workspace/board'

export interface AspectRatioPromptController
{
  isOpen: boolean
  open: () => void
  close: () => void
  // wraps addItems & opens the prompt when the import crosses from "no
  // mismatch" to "has mismatch" on a non-dismissed board
  importWithPromptCheck: (newItems: NewTierItem[]) => void
}

export const AspectRatioPromptContext =
  createContext<AspectRatioPromptController | null>(null)
