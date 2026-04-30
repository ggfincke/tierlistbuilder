// src/features/marketplace/components/Rail.tsx
// horizontally scrollable card rail w/ accessible keyboard scrolling & a
// loading skeleton row to keep layout stable while the list query resolves

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import type { MarketplaceTemplateSummary } from '@tierlistbuilder/contracts/marketplace/template'

import { Card, type CardSize } from './Card'

interface RailProps
{
  items: readonly MarketplaceTemplateSummary[] | undefined
  size?: CardSize
}

const CARD_WIDTH: Record<CardSize, number> = {
  small: 220,
  default: 260,
  large: 320,
}

const SkeletonCard = ({ size }: { size: CardSize }) => (
  <div
    aria-hidden="true"
    className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
    style={{ width: CARD_WIDTH[size], flex: '0 0 auto' }}
  >
    <div
      className="bg-[rgb(var(--t-overlay)/0.06)]"
      style={{
        height: size === 'small' ? 128 : size === 'default' ? 160 : 224,
      }}
    />
    <div className="space-y-2 px-3 py-3">
      <div className="h-3 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
      <div className="h-2 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    </div>
  </div>
)

export const Rail = ({ items, size = 'small' }: RailProps) =>
{
  const scrollerRef = useRef<HTMLDivElement>(null)

  const scrollByOffset = (offset: number) =>
  {
    scrollerRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
  }

  if (items && items.length === 0)
  {
    return (
      <p className="px-1 py-6 text-sm text-[var(--t-text-muted)]">
        No templates yet.
      </p>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Scroll left"
        className="focus-custom absolute -left-3 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-overlay)] text-[var(--t-text)] shadow-md transition hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:flex"
        onClick={() => scrollByOffset(-(CARD_WIDTH[size] * 2))}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
      </button>
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {items
          ? items.map((template) => (
              <div
                key={template.slug}
                style={{
                  width: CARD_WIDTH[size],
                  flex: '0 0 auto',
                  scrollSnapAlign: 'start',
                }}
              >
                <Card template={template} size={size} />
              </div>
            ))
          : Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} size={size} />
            ))}
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        className="focus-custom absolute -right-3 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--t-border)] bg-[var(--t-bg-overlay)] text-[var(--t-text)] shadow-md transition hover:bg-[var(--t-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] sm:flex"
        onClick={() => scrollByOffset(CARD_WIDTH[size] * 2)}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  )
}
