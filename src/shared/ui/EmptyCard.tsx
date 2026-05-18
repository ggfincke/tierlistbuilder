// src/shared/ui/EmptyCard.tsx
// shared dashed empty-state surface for feature panels & inline sections

import type { ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

type EmptyCardPadding = 'sm' | 'md' | 'lg'
type EmptyCardRadius = 'md' | 'lg' | 'xl'
type EmptyCardBodySize = 'xs' | 'sm'
type EmptyCardTitleWeight = 'medium' | 'semibold'

interface EmptyCardProps
{
  title?: ReactNode
  body: ReactNode
  action?: ReactNode
  className?: string
  padding?: EmptyCardPadding
  radius?: EmptyCardRadius
  bodySize?: EmptyCardBodySize
  titleWeight?: EmptyCardTitleWeight
}

const PADDING_CLASS: Record<EmptyCardPadding, string> = {
  sm: 'px-4 py-6',
  md: 'px-5 py-8',
  lg: 'px-6 py-10',
}

const RADIUS_CLASS: Record<EmptyCardRadius, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
}

const BODY_SIZE_CLASS: Record<EmptyCardBodySize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
}

const TITLE_WEIGHT_CLASS: Record<EmptyCardTitleWeight, string> = {
  medium: 'font-medium',
  semibold: 'font-semibold',
}

export const EmptyCard = ({
  title,
  body,
  action,
  className,
  padding = 'md',
  radius = 'lg',
  bodySize,
  titleWeight = 'semibold',
}: EmptyCardProps) => (
  <div
    className={joinClassNames(
      'border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] text-center',
      PADDING_CLASS[padding],
      RADIUS_CLASS[radius],
      className
    )}
  >
    {title && (
      <p
        className={joinClassNames(
          'text-sm text-[var(--t-text)]',
          TITLE_WEIGHT_CLASS[titleWeight]
        )}
      >
        {title}
      </p>
    )}
    <p
      className={joinClassNames(
        BODY_SIZE_CLASS[bodySize ?? (title ? 'xs' : 'sm')],
        'text-[var(--t-text-muted)]',
        title ? 'mt-1' : undefined
      )}
    >
      {body}
    </p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
)
