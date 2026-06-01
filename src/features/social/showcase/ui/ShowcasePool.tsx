// src/features/social/showcase/ui/ShowcasePool.tsx
// showcase unranked pool: PoolFrame w/o image import; items are published lanes

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { selectActiveItemCount } from '~/features/workspace/boards/model/slices/selectors'
import { PoolFrame } from '~/features/workspace/boards/ui/tier-list/PoolFrame'

// empty grid copy depends on whether the user has any published rankings at all
// (itemCount 0) vs has them all placed in tiers already
const ShowcasePoolEmpty = () =>
{
  const itemCount = useActiveBoardStore(selectActiveItemCount)

  return (
    <div className="flex min-h-24 w-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-[var(--t-text-faint)]">
      {itemCount === 0 ? (
        <p>Publish a ranking and it&apos;ll show up here to drag into tiers.</p>
      ) : (
        <p>Every ranking is in a tier. Drag one back here to unrank it.</p>
      )}
    </div>
  )
}

export const ShowcasePool = () => (
  <PoolFrame emptyState={<ShowcasePoolEmpty />} respectBoardLocked={false} />
)
