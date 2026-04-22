// src/features/workspace/settings/model/useAspectRatioPrompt.ts
// hook accessor for the mixed-ratio prompt context

import { useContext } from 'react'

import {
  AspectRatioPromptContext,
  type AspectRatioPromptController,
} from './aspectRatioPromptContext'

export const useAspectRatioPrompt = (): AspectRatioPromptController =>
{
  const ctx = useContext(AspectRatioPromptContext)
  if (!ctx)
  {
    throw new Error(
      'useAspectRatioPrompt must be used within <AspectRatioPromptProvider>'
    )
  }
  return ctx
}
