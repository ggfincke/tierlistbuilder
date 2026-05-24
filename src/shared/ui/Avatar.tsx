// src/shared/ui/Avatar.tsx
// circular avatar — shows an image when src is set, else token-styled initials.
// gradient variant = the signed-in user; neutral = marketplace author rows

import { useState } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import { extractInitial } from '~/shared/lib/initials'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fill'
type AvatarVariant = 'neutral' | 'gradient'

interface AvatarProps
{
  name: string
  src?: string | null
  fallback?: string
  size?: AvatarSize
  variant?: AvatarVariant
  className?: string
}

// 'fill' inherits the parent box & font-size — for use inside a sized button
const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-16 w-16 text-[22px]',
  fill: 'h-full w-full',
}

// variant only styles the initials fallback; an image covers it either way
const INITIAL_CLASS: Record<AvatarVariant, string> = {
  neutral: 'bg-[var(--t-bg-active)] font-semibold text-[var(--t-text)]',
  gradient: 'font-black text-[var(--t-accent-foreground)]',
}

const GRADIENT_STYLE = {
  background: 'linear-gradient(135deg, var(--t-accent), var(--t-accent-2))',
}

export const Avatar = ({
  name,
  src,
  fallback,
  size = 'sm',
  variant = 'neutral',
  className,
}: AvatarProps) =>
{
  // track the src that failed so a later src change retries without an effect
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  const showImage = Boolean(src) && src !== erroredSrc
  return (
    <span
      aria-hidden="true"
      className={joinClassNames(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        SIZE_CLASS[size],
        !showImage && INITIAL_CLASS[variant],
        className
      )}
      style={
        !showImage && variant === 'gradient' ? GRADIENT_STYLE : undefined
      }
    >
      {showImage && src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setErroredSrc(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        extractInitial(name, fallback)
      )}
    </span>
  )
}
