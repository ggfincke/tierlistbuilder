// src/features/marketplace/components/MediaMatteFrame.tsx
// matte-backed media frame for marketplace covers & thumbnails

import type { CSSProperties, ReactNode } from 'react'

interface MediaMatteFrameProps
{
  src?: string
  alt?: string
  className?: string
  imageClassName?: string
  style?: CSSProperties
  ariaHidden?: boolean
  children?: ReactNode
}

const joinClassName = (...parts: (string | undefined)[]): string =>
  parts.filter(Boolean).join(' ')

export const MediaMatteFrame = ({
  src,
  alt = '',
  className,
  imageClassName,
  style,
  ariaHidden = true,
  children,
}: MediaMatteFrameProps) => (
  <div
    className={joinClassName('bg-[var(--t-media-matte)]', className)}
    style={style}
    aria-hidden={ariaHidden ? 'true' : undefined}
  >
    {src && (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={joinClassName('h-full w-full object-cover', imageClassName)}
      />
    )}
    {children}
  </div>
)
