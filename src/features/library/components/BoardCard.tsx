// src/features/library/components/BoardCard.tsx
// grid-card repeat unit — cover artwork, title, tier breakdown bar, meta strip

import { ArrowRight, Pin } from 'lucide-react'

import type {
  LibraryBoardDensity,
  LibraryBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'

import { LIBRARY_STATUS_META } from '~/features/library/lib/statusMeta'
import { formatRelativeTime } from '~/shared/catalog/formatters'
import { Cover } from './Cover'
import { TierBar } from './TierBar'
import { VisibilityChip } from './VisibilityChip'

interface BoardCardProps
{
  board: LibraryBoardListItem
  density: LibraryBoardDensity
  onOpen?: (board: LibraryBoardListItem) => void
  isPending?: boolean
}

const DENSITY_CFG: Record<
  LibraryBoardDensity,
  {
    coverHeight: string
    bodyPadding: string
    titleSize: string
    showSubtitle: boolean
    coverDensity: 'dense' | 'default' | 'loose'
  }
> = {
  dense: {
    coverHeight: 'h-32',
    bodyPadding: 'px-3 py-2.5',
    titleSize: 'text-[12px]',
    showSubtitle: false,
    coverDensity: 'dense',
  },
  default: {
    coverHeight: 'h-40',
    bodyPadding: 'px-3.5 py-3',
    titleSize: 'text-[14px]',
    showSubtitle: true,
    coverDensity: 'default',
  },
  loose: {
    coverHeight: 'h-52',
    bodyPadding: 'px-4 py-3.5',
    titleSize: 'text-[16px]',
    showSubtitle: true,
    coverDensity: 'loose',
  },
}

export const BoardCard = ({
  board,
  density,
  onOpen,
  isPending,
}: BoardCardProps) =>
{
  const cfg = DENSITY_CFG[density]
  const isDraft = board.status === 'draft'
  const meta = LIBRARY_STATUS_META[board.status]

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
      aria-label={`${board.title} — ${meta.label.toLowerCase()}`}
      aria-busy={isPending || undefined}
      className="group focus-custom relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-left transition hover:-translate-y-0.5 hover:border-[var(--t-border-hover)] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-progress disabled:opacity-70"
    >
      <div className={`relative w-full overflow-hidden ${cfg.coverHeight}`}>
        <Cover
          items={board.coverItems}
          density={cfg.coverDensity}
          isDraft={isDraft}
        />

        {board.pinned && (
          <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start gap-1.5">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
              title="Pinned"
              aria-label="Pinned"
            >
              <Pin className="h-3 w-3" strokeWidth={2} />
            </span>
          </div>
        )}

        {density !== 'dense' && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2.5 opacity-0 transition group-hover:opacity-100"
            style={{
              background:
                'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
            }}
          >
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--t-text)] px-2.5 py-1 text-[11px] font-semibold text-[var(--t-bg-page)]">
              {meta.hoverAction}
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </span>
          </div>
        )}
      </div>

      <div
        className={`flex flex-1 flex-col gap-2 ${cfg.bodyPadding} text-[var(--t-text)]`}
      >
        <h3
          className={`line-clamp-1 font-semibold leading-snug ${cfg.titleSize}`}
        >
          {board.title}
        </h3>

        {cfg.showSubtitle && (
          <p className="line-clamp-1 text-[11px] text-[var(--t-text-muted)]">
            {board.activeItemCount}{' '}
            {board.activeItemCount === 1 ? 'item' : 'items'}
            {' · '}
            {board.tierColors.length}{' '}
            {board.tierColors.length === 1 ? 'tier' : 'tiers'}
          </p>
        )}

        <div className="mt-1">
          <TierBar board={board} showCount={density !== 'dense'} />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-[var(--t-text-muted)]">
          <VisibilityChip visibility={board.visibility} />
          <span className="text-[var(--t-text-faint)]">
            {formatRelativeTime(board.updatedAt)}
          </span>
        </div>
      </div>
    </button>
  )
}
