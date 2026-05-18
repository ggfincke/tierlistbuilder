// src/shared/ui/InitialAvatar.tsx
// token-backed circular initial used for user & author rows

import { joinClassNames } from '~/shared/lib/className'
import { extractInitial } from '~/shared/lib/initials'

type InitialAvatarSize = 'xs' | 'sm' | 'md'

interface InitialAvatarProps
{
  name: string
  fallback?: string
  size?: InitialAvatarSize
  className?: string
}

const SIZE_CLASS: Record<InitialAvatarSize, string> = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
}

export const InitialAvatar = ({
  name,
  fallback,
  size = 'sm',
  className,
}: InitialAvatarProps) => (
  <span
    aria-hidden="true"
    className={joinClassNames(
      'flex shrink-0 items-center justify-center rounded-full bg-[var(--t-bg-active)] font-semibold text-[var(--t-text)]',
      SIZE_CLASS[size],
      className
    )}
  >
    {extractInitial(name, fallback)}
  </span>
)
