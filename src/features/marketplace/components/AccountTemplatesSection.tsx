// src/features/marketplace/components/AccountTemplatesSection.tsx
// owned-template management list — stats, edit, unpublish/republish, view

import { lazy, useState } from 'react'
import { ExternalLink, Eye, Layers, Loader2, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'

import type {
  MarketplaceTemplateManagementItem,
  TemplateVisibility,
} from '@tierlistbuilder/contracts/marketplace/template'
import {
  useMyTemplateManagementList,
  useRepublishMyTemplateMutation,
  useUnpublishMyTemplateMutation,
} from '~/features/marketplace/model/useTemplateDetail'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import { formatCount, formatRelativeTime } from '~/shared/catalog/formatters'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import {
  loadPublishModal,
  preloadPublishModal,
} from '~/features/marketplace/components/loadPublishModal'
import type { PublishModalEditInitialValues } from '~/features/marketplace/components/PublishModal'

const PublishModal = lazy(() =>
  loadPublishModal().then((m) => ({
    default: m.PublishModal,
  }))
)

interface VisibilityBadgeProps
{
  visibility: TemplateVisibility
  isPubliclyListable: boolean
}

const VisibilityBadge = ({
  visibility,
  isPubliclyListable,
}: VisibilityBadgeProps) =>
{
  // unpublished -> the template-state field is the source of truth, not the
  // stored visibility (which is preserved across the unpublish/republish round
  // trip so re-publishing restores the prior listing setting)
  if (!isPubliclyListable && visibility === 'public')
  {
    return (
      <span className="rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
        Unpublished
      </span>
    )
  }
  if (visibility === 'unlisted')
  {
    return (
      <span className="rounded-full border border-[var(--t-border)] bg-[var(--t-bg-page)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
        Unlisted
      </span>
    )
  }
  return (
    <span className="rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--t-text-secondary)]">
      Public
    </span>
  )
}

interface RowProps
{
  template: MarketplaceTemplateManagementItem
  busy: boolean
  onEdit: () => void
  onTogglePublish: () => void
}

const TemplateRow = ({ template, busy, onEdit, onTogglePublish }: RowProps) =>
{
  const isUnpublished =
    template.publicationState === 'unpublished' || !template.isPubliclyListable
  const categoryLabel = CATEGORY_META[template.category].label
  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)] p-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--t-text)]">
            {template.title}
          </span>
          <VisibilityBadge
            visibility={template.visibility}
            isPubliclyListable={template.isPubliclyListable}
          />
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--t-text-faint)]">
          {categoryLabel} · Updated {formatRelativeTime(template.updatedAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-[var(--t-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(template.useCount)} forks
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" strokeWidth={1.8} />
            {formatCount(template.viewCount)} views
          </span>
          <span className="text-[var(--t-text-faint)]">
            {formatCount(template.weeklyUseCount)} this week
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 self-end sm:self-center">
        <Link
          to={`${TEMPLATES_ROUTE_PATH}/${template.slug}`}
          aria-label={`View ${template.title}`}
          title="View in gallery"
          className="focus-custom inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--t-border)] text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
        </Link>
        <button
          type="button"
          onClick={onEdit}
          onMouseEnter={preloadPublishModal}
          onFocus={preloadPublishModal}
          aria-label={`Edit ${template.title}`}
          title="Edit"
          disabled={busy}
          className="focus-custom inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--t-border)] text-[var(--t-text-muted)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={onTogglePublish}
          disabled={busy}
          className="focus-custom inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--t-border)] px-2.5 text-xs font-medium text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />}
          {isUnpublished ? 'Republish' : 'Unpublish'}
        </button>
      </div>
    </div>
  )
}

const SkeletonRow = () => (
  <div
    aria-hidden="true"
    className="h-[72px] animate-pulse rounded-md border border-[var(--t-border)] bg-[var(--t-bg-surface)]"
  />
)

const toEditInitialValues = (
  template: MarketplaceTemplateManagementItem
): PublishModalEditInitialValues => ({
  slug: template.slug,
  title: template.title,
  description: template.description ?? '',
  category: template.category,
  tags: [...template.tags],
  visibility: template.visibility,
  creditLine: template.creditLine ?? '',
})

export const AccountTemplatesSection = () =>
{
  const list = useMyTemplateManagementList(true)
  const unpublish = useUnpublishMyTemplateMutation()
  const republish = useRepublishMyTemplateMutation()
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [editTarget, setEditTarget] =
    useState<PublishModalEditInitialValues | null>(null)
  const [confirmUnpublishSlug, setConfirmUnpublishSlug] = useState<{
    slug: string
    title: string
  } | null>(null)

  const runUnpublish = async (slug: string) =>
  {
    setBusySlug(slug)
    try
    {
      await unpublish({ slug })
      toast('Template unpublished', 'success')
    }
    catch (caught)
    {
      logger.error('marketplace', 'unpublishMyTemplate failed', caught)
      toast(formatMarketplaceError(caught), 'error')
    }
    finally
    {
      setBusySlug(null)
    }
  }

  const runRepublish = async (slug: string) =>
  {
    setBusySlug(slug)
    try
    {
      await republish({ slug })
      toast('Template republished', 'success')
    }
    catch (caught)
    {
      logger.error('marketplace', 'republishMyTemplate failed', caught)
      toast(formatMarketplaceError(caught), 'error')
    }
    finally
    {
      setBusySlug(null)
    }
  }

  if (list === undefined)
  {
    return (
      <div className="space-y-2">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  if (list.items.length === 0)
  {
    return (
      <p className="rounded-md border border-dashed border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.02)] px-4 py-6 text-center text-sm text-[var(--t-text-muted)]">
        You haven't published any templates yet. Use the publish button on the
        gallery to share your first one.
      </p>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {list.items.map((template) =>
        {
          const isUnpublished =
            template.publicationState === 'unpublished' ||
            !template.isPubliclyListable
          return (
            <TemplateRow
              key={template.slug}
              template={template}
              busy={busySlug === template.slug}
              onEdit={() => setEditTarget(toEditInitialValues(template))}
              onTogglePublish={() =>
              {
                if (isUnpublished)
                {
                  void runRepublish(template.slug)
                }
                else
                {
                  setConfirmUnpublishSlug({
                    slug: template.slug,
                    title: template.title,
                  })
                }
              }}
            />
          )
        })}
      </div>

      <LazyModalSlot when={editTarget !== null} section="edit template">
        {() =>
          editTarget && (
            <PublishModal
              open
              edit={editTarget}
              onClose={() => setEditTarget(null)}
            />
          )
        }
      </LazyModalSlot>

      <ConfirmDialog
        open={confirmUnpublishSlug !== null}
        title="Unpublish template?"
        description={`"${confirmUnpublishSlug?.title ?? ''}" will be hidden from the gallery. You can republish it any time.`}
        confirmText="Unpublish"
        onCancel={() => setConfirmUnpublishSlug(null)}
        onConfirm={() =>
        {
          if (confirmUnpublishSlug)
          {
            void runUnpublish(confirmUnpublishSlug.slug)
            setConfirmUnpublishSlug(null)
          }
        }}
      />
    </>
  )
}
