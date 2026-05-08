// src/features/library/components/LibrarySkeleton.tsx
// loading-state placeholders for the page's content section

import type { LibraryBoardDensity } from '@tierlistbuilder/contracts/workspace/board'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'

interface LibrarySkeletonProps
{
  density: LibraryBoardDensity
  count?: number
  layout: 'grid' | 'list'
}

const COVER_HEIGHT_BY_DENSITY: Record<LibraryBoardDensity, string> = {
  dense: 'h-32',
  default: 'h-40',
  loose: 'h-52',
}

const GridSkeletonCard = ({ density }: { density: LibraryBoardDensity }) => (
  <div
    aria-hidden="true"
    className="flex flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
  >
    <SkeletonBlock className={COVER_HEIGHT_BY_DENSITY[density]} />
    <div className="space-y-2 px-3 py-3">
      <SkeletonText className="w-3/4" tone="strong" />
      <SkeletonBlock className="h-2 w-1/2 rounded" tone="soft" />
      <SkeletonBlock className="h-1 rounded" />
      <div className="flex justify-between gap-2 pt-1">
        <SkeletonBlock className="h-2 w-16 rounded" tone="soft" />
        <SkeletonBlock className="h-2 w-10 rounded" tone="soft" />
      </div>
    </div>
  </div>
)

const ListSkeletonRow = () => (
  <div
    aria-hidden="true"
    className="grid items-center gap-4 px-4 py-3"
    style={{
      gridTemplateColumns:
        'minmax(56px, 56px) minmax(0, 2.6fr) minmax(120px, 1.6fr) 110px 96px 90px',
      borderBottom: '1px solid var(--t-border)',
    }}
  >
    <SkeletonBlock className="h-10 w-14 rounded-md" />
    <div className="space-y-2">
      <SkeletonText className="w-2/3" tone="strong" />
      <SkeletonBlock className="h-2 w-1/2 rounded" tone="soft" />
    </div>
    <SkeletonBlock className="h-1.5 rounded-full" />
    <SkeletonBlock className="h-4 w-20 rounded-full" tone="soft" />
    <SkeletonText className="w-14" tone="soft" />
    <SkeletonBlock className="h-2 w-12 justify-self-end rounded" tone="soft" />
  </div>
)

const ListSkeletonHeader = () => (
  <div
    aria-hidden="true"
    className="grid items-center gap-4 px-4 py-2.5"
    style={{
      gridTemplateColumns:
        'minmax(56px, 56px) minmax(0, 2.6fr) minmax(120px, 1.6fr) 110px 96px 90px',
      borderBottom: '1px solid var(--t-border)',
      background: 'var(--t-bg-page)',
    }}
  >
    <div />
    <SkeletonBlock className="h-2 w-12 rounded" />
    <SkeletonBlock className="h-2 w-16 rounded" />
    <SkeletonBlock className="h-2 w-12 rounded" />
    <SkeletonBlock className="h-2 w-14 rounded" />
    <SkeletonBlock className="h-2 w-10 justify-self-end rounded" />
  </div>
)

export const LibrarySkeleton = ({
  density,
  count = 6,
  layout,
}: LibrarySkeletonProps) =>
{
  if (layout === 'list')
  {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-sunken)]">
        <ListSkeletonHeader />
        {Array.from({ length: count }).map((_, i) => (
          <ListSkeletonRow key={i} />
        ))}
      </div>
    )
  }

  const cols = density === 'dense' ? 4 : density === 'loose' ? 2 : 3
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <GridSkeletonCard key={i} density={density} />
      ))}
    </div>
  )
}
