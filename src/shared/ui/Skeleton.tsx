// src/shared/ui/Skeleton.tsx
// shared loading placeholders for cards, text rows, & panels

import type { CSSProperties } from 'react'

import { joinClassNames } from '~/shared/lib/className'

type SkeletonTone = 'soft' | 'medium' | 'strong'

interface SkeletonBlockProps
{
  className?: string
  tone?: SkeletonTone
}

interface SkeletonCardProps
{
  className?: string
  coverClassName?: string
  style?: CSSProperties
}

const TONE_CLASS: Record<SkeletonTone, string> = {
  soft: 'bg-[rgb(var(--t-overlay)/0.04)]',
  medium: 'bg-[rgb(var(--t-overlay)/0.06)]',
  strong: 'bg-[rgb(var(--t-overlay)/0.08)]',
}

export const SkeletonBlock = ({
  className,
  tone = 'medium',
}: SkeletonBlockProps) => (
  <div
    aria-hidden="true"
    className={joinClassNames('animate-pulse', TONE_CLASS[tone], className)}
  />
)

export const SkeletonText = ({
  className,
  tone = 'medium',
}: SkeletonBlockProps) => (
  <SkeletonBlock
    className={joinClassNames('h-3 rounded', className)}
    tone={tone}
  />
)

export const SkeletonCard = ({
  className,
  coverClassName = 'h-40',
  style,
}: SkeletonCardProps) => (
  <div
    aria-hidden="true"
    style={style}
    className={joinClassNames(
      'flex animate-pulse flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]',
      className
    )}
  >
    <div
      className={joinClassNames(
        'bg-[rgb(var(--t-overlay)/0.06)]',
        coverClassName
      )}
    />
    <div className="space-y-2 px-3 py-3">
      <div className="h-3 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
      <div className="h-2 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    </div>
  </div>
)
