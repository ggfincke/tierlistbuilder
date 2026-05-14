// src/features/library/components/BoardCard.tsx
// grid-card repeat unit — cover artwork w/ sync + publish corner chips, a
// mono eyebrow, title, & tier-pill meta strip

import { memo } from 'react'
import { ArrowRight } from 'lucide-react'

import type {
  LibraryBoardDensity,
  LibraryBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'

import { LIBRARY_SYNC_META } from '~/features/library/lib/statusMeta'
import { PUBLISH_STATE_META } from '~/shared/board-ui/publishStateMeta'
import { formatRelativeTime, pluralize } from '~/shared/catalog/formatters'
import { Cover } from './Cover'
import { PublishChip } from './PublishChip'
import { SyncChip } from './SyncChip'
import { TierPills } from './TierPills'
import { VisibilityChip } from './VisibilityChip'

interface BoardCardProps
{
  board: LibraryBoardListItem
  density: LibraryBoardDensity
  onOpen?: (board: LibraryBoardListItem) => void
  isPending?: boolean
}

interface DensityCfg
{
  coverHeight: string
  bodyPadding: string
  titleSize: string
  coverDensity: 'dense' | 'default' | 'loose'
  // dense cards drop the tier-pill meta row to stay compact at 4-up
  showMeta: boolean
}

const DENSITY_CFG: Record<LibraryBoardDensity, DensityCfg> = {
  dense: {
    coverHeight: 'h-36',
    bodyPadding: 'px-3 py-2.5',
    titleSize: 'text-[13px]',
    coverDensity: 'dense',
    showMeta: false,
  },
  default: {
    coverHeight: 'h-44',
    bodyPadding: 'px-3.5 py-3',
    titleSize: 'text-[15px]',
    coverDensity: 'default',
    showMeta: true,
  },
  loose: {
    coverHeight: 'h-56',
    bodyPadding: 'px-4 py-3.5',
    titleSize: 'text-[16px]',
    coverDensity: 'loose',
    showMeta: true,
  },
}

// memo so a single card flipping isPending doesn't re-render every sibling.
// onOpen is referentially stable via useOpenLibraryBoard
const BoardCardImpl = ({
  board,
  density,
  onOpen,
  isPending,
}: BoardCardProps) =>
{
  const cfg = DENSITY_CFG[density]
  const isDraft = board.publishState === 'draft'
  const publishMeta = PUBLISH_STATE_META[board.publishState]
  const syncMeta = LIBRARY_SYNC_META[board.syncState]

  const handleClick = () =>
  {
    if (!onOpen || isPending) return
    onOpen(board)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!onOpen || isPending}
      aria-label={`${board.title} — ${publishMeta.label}, ${syncMeta.label}`}
      aria-busy={isPending || undefined}
      className="group focus-custom relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-left transition hover:-translate-y-0.5 hover:border-[var(--t-border-secondary)] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-progress disabled:opacity-70"
    >
      <div className={`relative w-full overflow-hidden ${cfg.coverHeight}`}>
        <Cover
          items={board.coverItems}
          density={cfg.coverDensity}
          isDraft={isDraft}
          title={board.title}
        />

        {/* corner chips — sync (icon) top-left, publish (label) top-right */}
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <SyncChip state={board.syncState} variant="overlay" />
          <PublishChip state={board.publishState} variant="overlay" />
        </div>

        {/* hover CTA — names the next action for this publish state */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end p-2.5 opacity-0 transition group-hover:opacity-100"
          style={{
            background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
          }}
        >
          <span className="inline-flex items-center gap-1 rounded-md bg-[var(--t-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--t-accent-foreground)] shadow-[2px_2px_0_var(--t-accent-2)]">
            {publishMeta.hoverAction}
            <ArrowRight className="h-3 w-3" strokeWidth={2.4} />
          </span>
        </div>
      </div>

      <div
        className={`flex flex-1 flex-col gap-1.5 ${cfg.bodyPadding} text-[var(--t-text)]`}
      >
        <div
          className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-[var(--t-text-faint)]"
          style={{ fontFamily: 'var(--ts-mono)' }}
        >
          <span>
            {board.activeItemCount} {pluralize(board.activeItemCount, 'item')}
          </span>
          <span>{formatRelativeTime(board.updatedAt)}</span>
        </div>

        <h3
          className={`line-clamp-2 font-bold leading-tight tracking-[-0.015em] ${cfg.titleSize}`}
        >
          {board.title}
        </h3>

        {cfg.showMeta && (
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <TierPills board={board} />
            <VisibilityChip visibility={board.visibility} />
          </div>
        )}
      </div>
    </button>
  )
}

export const BoardCard = memo(BoardCardImpl)
