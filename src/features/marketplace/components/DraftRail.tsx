// src/features/marketplace/components/DraftRail.tsx
// horizontal "Jump back in" cards — left: compact thumbnail strip, right:
// status pill + board title + progress bar

import { ArrowRight, Loader2 } from 'lucide-react'

import type { MarketplaceTemplateDraft } from '@tierlistbuilder/contracts/marketplace/template'

import { formatRelativeTime } from '~/shared/catalog/formatters'
import { MediaMatteFrame } from './MediaMatteFrame'

interface DraftRailProps
{
  drafts: readonly MarketplaceTemplateDraft[] | undefined
  pendingBoardExternalId: string | null
  onOpen: (draft: MarketplaceTemplateDraft) => void
}

const CARD_WIDTH = 360
const STRIP_TILES = 4

const clampProgress = (progress: number): number =>
  Math.max(0, Math.min(100, Math.round(progress)))

const statusLabel = (progress: number): string =>
{
  if (progress >= 90) return 'Almost done'
  if (progress >= 1) return 'In progress'
  return 'Started'
}

const SkeletonCard = () => (
  <div
    aria-hidden="true"
    className="animate-pulse overflow-hidden rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
    style={{ width: CARD_WIDTH, flex: '0 0 auto' }}
  >
    <div className="flex">
      <div className="h-[120px] w-[120px] bg-[rgb(var(--t-overlay)/0.06)]" />
      <div className="flex-1 space-y-2 p-4">
        <div className="h-3 w-1/3 rounded bg-[rgb(var(--t-overlay)/0.05)]" />
        <div className="h-4 w-3/4 rounded bg-[rgb(var(--t-overlay)/0.08)]" />
        <div className="h-2 w-full rounded bg-[rgb(var(--t-overlay)/0.05)]" />
      </div>
    </div>
  </div>
)

const ThumbnailStrip = ({ draft }: { draft: MarketplaceTemplateDraft }) =>
{
  const coverMedia = draft.template.coverMedia
  const tiles = draft.template.coverItems.slice(0, STRIP_TILES)

  if (coverMedia)
  {
    return <MediaMatteFrame src={coverMedia.url} className="h-full w-full" />
  }

  if (tiles.length === 0)
  {
    return (
      <div
        aria-hidden="true"
        className="flex h-full w-full items-center justify-center bg-[var(--t-media-matte)] text-[10px] font-mono uppercase tracking-[0.2em] text-white/70"
      >
        {draft.template.title.slice(0, 14)}
      </div>
    )
  }

  return (
    <MediaMatteFrame
      className="grid h-full w-full"
      style={{
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: '2px',
      }}
    >
      {Array.from({ length: STRIP_TILES }).map((_, i) =>
      {
        const item = tiles[i]
        if (!item)
        {
          return (
            <div key={`empty-${i}`} className="bg-[var(--t-media-matte)]" />
          )
        }
        return (
          <div
            key={item.media.externalId}
            className="relative overflow-hidden bg-[var(--t-media-matte)]"
          >
            <MediaMatteFrame src={item.media.url} className="h-full w-full" />
          </div>
        )
      })}
    </MediaMatteFrame>
  )
}

const DraftCard = ({
  draft,
  disabled,
  isPending,
  onOpen,
}: {
  draft: MarketplaceTemplateDraft
  disabled: boolean
  isPending: boolean
  onOpen: (draft: MarketplaceTemplateDraft) => void
}) =>
{
  const progress = clampProgress(draft.progressPercent)
  const status = statusLabel(progress)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onOpen(draft)}
      aria-label={`Resume ${draft.boardTitle}, ${progress}% ranked`}
      className="group focus-custom relative flex overflow-hidden rounded-2xl border border-[var(--t-border)] bg-[var(--t-bg-surface)] text-left transition hover:border-[var(--t-border-hover)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-wait disabled:opacity-60"
      style={{
        width: CARD_WIDTH,
        flex: '0 0 auto',
        scrollSnapAlign: 'start',
      }}
    >
      <div className="relative h-[120px] w-[120px] shrink-0 overflow-hidden">
        <ThumbnailStrip draft={draft} />
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <Loader2
              className="h-5 w-5 animate-spin text-white"
              strokeWidth={2}
            />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
            <span>In progress</span>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeTime(draft.updatedAt)}</span>
          </div>
          <h3 className="truncate text-[15px] font-semibold leading-tight text-[var(--t-text)]">
            {draft.boardTitle}
          </h3>
        </div>

        <div className="space-y-1.5">
          <div
            className="h-[3px] overflow-hidden rounded-full bg-[rgb(var(--t-overlay)/0.08)]"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-[var(--t-text)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--t-text-faint)]">
            <span>
              {draft.rankedItemCount}/{draft.activeItemCount} ranked
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--t-text-secondary)] transition group-hover:text-[var(--t-text)]">
              {status}
              <ArrowRight className="h-3 w-3" strokeWidth={1.8} />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

export const DraftRail = ({
  drafts,
  pendingBoardExternalId,
  onOpen,
}: DraftRailProps) => (
  <div
    className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    style={{ scrollSnapType: 'x proximity' }}
  >
    {drafts
      ? drafts.map((draft) => (
          <DraftCard
            key={draft.boardExternalId}
            draft={draft}
            disabled={pendingBoardExternalId !== null}
            isPending={pendingBoardExternalId === draft.boardExternalId}
            onOpen={onOpen}
          />
        ))
      : Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
)
