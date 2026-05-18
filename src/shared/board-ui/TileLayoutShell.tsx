// src/shared/board-ui/TileLayoutShell.tsx
// shared tile shell for caption strips plus image-area measurement.

import { type ReactNode, type Ref } from 'react'

import { CaptionStrip } from '~/shared/board-ui/labelBlocks'
import type { ResolvedLabelDisplay } from '~/shared/board-ui/labelDisplay'

interface TileLayoutShellProps
{
  caption: ResolvedLabelDisplay | null
  // optional ref lets auto-crop measure the post-caption image area
  imageAreaRef?: Ref<HTMLDivElement>
  children: ReactNode
}

export const TileLayoutShell = ({
  caption,
  imageAreaRef,
  children,
}: TileLayoutShellProps) =>
{
  const placementMode = caption?.placement.mode
  const isCaptioned =
    !!caption &&
    (placementMode === 'captionAbove' || placementMode === 'captionBelow')

  if (!isCaptioned)
  {
    if (!imageAreaRef) return <>{children}</>
    return (
      <div ref={imageAreaRef} className="relative h-full w-full">
        {children}
      </div>
    )
  }

  const isAbove = placementMode === 'captionAbove'
  return (
    <div className="flex h-full w-full flex-col">
      {isAbove && <CaptionStrip display={caption} />}
      <div ref={imageAreaRef} className="relative min-h-0 flex-1">
        {children}
      </div>
      {!isAbove && <CaptionStrip display={caption} />}
    </div>
  )
}
