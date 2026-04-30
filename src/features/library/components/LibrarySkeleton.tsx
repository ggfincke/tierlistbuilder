// src/features/library/components/LibrarySkeleton.tsx
// loading-state placeholders for the page's content section

import type { LibraryBoardDensity } from '@tierlistbuilder/contracts/workspace/board'

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
    className="flex animate-pulse flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
  >
    <div
      className={`${COVER_HEIGHT_BY_DENSITY[density]} bg-[rgb(var(--t-overlay)/0.06)]`}
    />
    <div className="space-y-2 px-3 py-3">
      <div className="h-3 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
      <div className="h-2 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
      <div className="h-1 rounded bg-[rgb(var(--t-overlay)/0.06)]" />
      <div className="flex justify-between gap-2 pt-1">
        <div className="h-2 w-16 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="h-2 w-10 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
      </div>
    </div>
  </div>
)

const ListSkeletonRow = () => (
  <div
    aria-hidden="true"
    className="grid animate-pulse items-center gap-4 px-4 py-3"
    style={{
      gridTemplateColumns:
        'minmax(56px, 56px) minmax(0, 2.6fr) minmax(120px, 1.6fr) 110px 96px 90px',
      borderBottom: '1px solid var(--t-border)',
    }}
  >
    <div className="h-10 w-14 rounded-md bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="space-y-2">
      <div className="h-3 w-2/3 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
      <div className="h-2 w-1/2 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    </div>
    <div className="h-1.5 rounded-full bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="h-4 w-20 rounded-full bg-[rgb(var(--t-overlay)/0.05)]" />
    <div className="h-3 w-14 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
    <div className="h-2 w-12 justify-self-end rounded bg-[rgb(var(--t-overlay)/0.05)]" />
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
    <div className="h-2 w-12 rounded bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="h-2 w-16 rounded bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="h-2 w-12 rounded bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="h-2 w-14 rounded bg-[rgb(var(--t-overlay)/0.06)]" />
    <div className="h-2 w-10 justify-self-end rounded bg-[rgb(var(--t-overlay)/0.06)]" />
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
