// src/features/marketplace/components/cover/MediaMatteFrame.tsx
// matte-backed media frame for marketplace covers & thumbnails

import type { CSSProperties, ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import type {
  MediaDecoding,
  MediaLoading,
} from '~/shared/board-ui/mediaImageAttrs'

interface MediaMatteFrameProps
{
  src?: string
  alt?: string
  // intrinsic image dimensions — when provided, set as html width/height attrs
  // so the browser can reserve layout space & size the decoded bitmap budget
  // appropriately. callers should pass these whenever data has them
  width?: number
  height?: number
  loading?: MediaLoading
  decoding?: MediaDecoding
  className?: string
  imageClassName?: string
  style?: CSSProperties
  ariaHidden?: boolean
  children?: ReactNode
}

export const MediaMatteFrame = ({
  src,
  alt = '',
  width,
  height,
  loading = 'lazy',
  decoding = 'async',
  className,
  imageClassName,
  style,
  ariaHidden = true,
  children,
}: MediaMatteFrameProps) => (
  <div
    className={joinClassNames('bg-[var(--t-media-matte)]', className)}
    style={style}
    aria-hidden={ariaHidden ? 'true' : undefined}
  >
    {src && (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        draggable={false}
        className={joinClassNames('h-full w-full object-cover', imageClassName)}
      />
    )}
    {children}
  </div>
)
