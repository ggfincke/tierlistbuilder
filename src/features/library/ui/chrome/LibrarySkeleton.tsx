// src/features/library/ui/chrome/LibrarySkeleton.tsx
// loading-state placeholders for the page's content section

import type { LibraryBoardDensity } from '@tierlistbuilder/contracts/workspace/board'
import { SkeletonBlock, SkeletonText } from '~/shared/ui/Skeleton'
import { BOARD_LIST_GRID_TEMPLATE } from '~/features/library/ui/list/boardListGrid'

interface LibrarySkeletonProps
{
  density: LibraryBoardDensity
  count?: number
  layout: 'grid' | 'list'
}

const COVER_HEIGHT_BY_DENSITY: Record<LibraryBoardDensity, string> = {
  dense: 'h-36',
  default: 'h-44',
  loose: 'h-56',
}

const GridSkeletonCard = ({ density }: { density: LibraryBoardDensity }) => (
  <div
    aria-hidden="true"
    className="flex flex-col overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
  >
    <SkeletonBlock className={COVER_HEIGHT_BY_DENSITY[density]} />
    <div className="space-y-2 px-3 py-3">
      <SkeletonBlock className="h-2 w-1/3 rounded" tone="soft" />
      <SkeletonText className="w-3/4" tone="strong" />
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
    className="grid items-center gap-4 py-3 pl-4 pr-12"
    style={{
      gridTemplateColumns: BOARD_LIST_GRID_TEMPLATE,
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
    <SkeletonBlock className="h-2 w-12 justify-self-end rounded" tone="soft" />
  </div>
)

const ListSkeletonHeader = () => (
  <div
    aria-hidden="true"
    className="grid items-center gap-4 py-2.5 pl-4 pr-12"
    style={{
      gridTemplateColumns: BOARD_LIST_GRID_TEMPLATE,
      borderBottom: '1px solid var(--t-border)',
      background: 'var(--t-bg-page)',
    }}
  >
    <div />
    <SkeletonBlock className="h-2 w-12 rounded" />
    <SkeletonBlock className="h-2 w-16 rounded" />
    <SkeletonBlock className="h-2 w-12 rounded" />
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
      className="grid gap-3.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <GridSkeletonCard key={i} density={density} />
      ))}
    </div>
  )
}
