// src/features/library/ui/cards/BoardCard.tsx
// grid-card repeat unit — cover artwork w/ sync chip + publish chip + overflow
// menu in the corners, a mono eyebrow, title, & tier-pill meta strip

import { memo } from 'react'
import { ArrowRight } from 'lucide-react'

import type {
  LibraryBoardDensity,
  LibraryBoardListItem,
} from '@tierlistbuilder/contracts/workspace/board'

import { LIBRARY_SYNC_META } from '~/features/library/lib/statusMeta'
import { makeBoardClickHandler } from '~/features/library/lib/boardClickHandler'
import { LIBRARY_COVER_HEIGHT_BY_DENSITY } from '~/features/library/lib/densityLayout'
import { PUBLISH_STATE_META } from '~/shared/board-ui/publishStateMeta'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { CHUNKY_SHADOW_ACCENT_STATIC } from '~/shared/ui/chunkyShadow'
import { BoardCardMenu } from './BoardCardMenu'
import { BoardMosaicCover } from './BoardMosaicCover'
import { TierPills } from './TierPills'
import { PublishChip } from '../chips/PublishChip'
import { SyncChip } from '../chips/SyncChip'
import { VisibilityChip } from '../chips/VisibilityChip'

interface BoardCardProps
{
  board: LibraryBoardListItem
  density: LibraryBoardDensity
  onOpen?: (board: LibraryBoardListItem) => void
  // omitting onRequestDelete hides the overflow menu (read-only contexts)
  onRequestDelete?: (board: LibraryBoardListItem) => void
  onRequestRename?: (board: LibraryBoardListItem) => void
  onDuplicate?: (board: LibraryBoardListItem) => void
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
    coverHeight: LIBRARY_COVER_HEIGHT_BY_DENSITY.dense,
    bodyPadding: 'px-3 py-2.5',
    titleSize: 'text-[13px]',
    coverDensity: 'dense',
    showMeta: false,
  },
  default: {
    coverHeight: LIBRARY_COVER_HEIGHT_BY_DENSITY.default,
    bodyPadding: 'px-3.5 py-3',
    titleSize: 'text-[15px]',
    coverDensity: 'default',
    showMeta: true,
  },
  loose: {
    coverHeight: LIBRARY_COVER_HEIGHT_BY_DENSITY.loose,
    bodyPadding: 'px-4 py-3.5',
    titleSize: 'text-[16px]',
    coverDensity: 'loose',
    showMeta: true,
  },
}

// memo so a single card flipping isPending doesn't re-render every sibling
const BoardCardImpl = ({
  board,
  density,
  onOpen,
  onRequestDelete,
  onRequestRename,
  onDuplicate,
  isPending,
}: BoardCardProps) =>
{
  const cfg = DENSITY_CFG[density]
  const isLive = board.publishState === 'live'
  const publishMeta = PUBLISH_STATE_META[board.publishState]
  const syncMeta = LIBRARY_SYNC_META[board.syncState]
  const openAction = makeBoardClickHandler(onOpen, isPending, board)

  return (
    <div className="group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-surface)] transition focus-within:border-[var(--t-border-secondary)] hover:-translate-y-0.5 hover:border-[var(--t-border-secondary)] hover:shadow-lg">
      <button
        type="button"
        onClick={openAction.onClick}
        disabled={openAction.disabled}
        aria-label={`${board.title} — ${publishMeta.label}, ${syncMeta.label}`}
        aria-busy={isPending || undefined}
        className="focus-custom relative flex h-full w-full min-w-0 flex-col text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] disabled:cursor-progress disabled:opacity-70"
      >
        <div className={`relative w-full overflow-hidden ${cfg.coverHeight}`}>
          <BoardMosaicCover
            items={board.coverItems}
            density={cfg.coverDensity}
            itemAspectRatio={board.itemAspectRatio}
            autoPlate={board.autoPlate}
            defaultItemImageFit={board.defaultItemImageFit}
            defaultItemImagePadding={board.defaultItemImagePadding}
            sourceCoverMedia={board.sourceTemplateCoverMedia}
            sourceCoverFraming={board.sourceTemplateCoverFraming}
            title={board.title}
          />

          <div className="pointer-events-none absolute left-2 top-2">
            <SyncChip state={board.syncState} variant="overlay" />
          </div>

          {/* hover CTA — names the next action for this publish state */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end p-2.5 opacity-0 transition group-hover:opacity-100"
            style={{
              background:
                'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
            }}
          >
            <span
              className={`inline-flex items-center gap-1 rounded-md bg-[var(--t-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--t-accent-foreground)] ${CHUNKY_SHADOW_ACCENT_STATIC}`}
            >
              {publishMeta.hoverAction}
              <ArrowRight className="h-3 w-3" strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <div
          className={`flex flex-1 flex-col gap-1.5 ${cfg.bodyPadding} text-[var(--t-text)]`}
        >
          <div
            className={`flex items-center justify-between text-[10px] uppercase tracking-[0.14em] ${
              isLive ? 'text-[var(--t-accent)]' : 'text-[var(--t-text-faint)]'
            }`}
            style={{ fontFamily: 'var(--ts-mono)' }}
          >
            <span>{formatCountedWord(board.activeItemCount, 'item')}</span>
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

      <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1.5">
        <PublishChip state={board.publishState} variant="overlay" />
        {onRequestDelete && (
          <div className="pointer-events-auto">
            <BoardCardMenu
              board={board}
              onRequestDelete={onRequestDelete}
              onRequestRename={onRequestRename}
              onDuplicate={onDuplicate}
              disabled={isPending}
              variant="overlay"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const BoardCard = memo(BoardCardImpl)
