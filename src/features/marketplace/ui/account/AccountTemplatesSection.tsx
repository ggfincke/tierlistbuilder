// src/features/marketplace/ui/account/AccountTemplatesSection.tsx
// owned-template management list — stats, edit, unpublish/republish, view

import { useState } from 'react'
import { ExternalLink, Eye, Layers, Loader2, Pencil } from 'lucide-react'

import type { MarketplaceTemplateManagementItem } from '@tierlistbuilder/contracts/marketplace/template'
import {
  useMyTemplateManagementList,
  useRepublishMyTemplateMutation,
  useUnpublishMyTemplateMutation,
} from '~/features/marketplace/model/detail/useTemplateDetail'
import { CATEGORY_META } from '~/features/marketplace/model/categories'
import { formatMarketplaceError } from '~/features/marketplace/model/formatters'
import {
  canViewTemplateInGallery,
  getTemplatePublishControl,
  type TemplatePublishAction,
} from '~/features/marketplace/model/account/templatePublishActions'
import { formatCount } from '~/shared/catalog/formatters'
import { formatRelativeTime } from '~/shared/lib/dateFormatting'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { LazyModalSlot } from '~/shared/overlay/LazyModalSlot'
import { logger } from '~/shared/lib/logger'
import { toast } from '~/shared/notifications/useToastStore'
import { TEMPLATES_ROUTE_PATH } from '~/shared/routes/pathname'
import { EmptyCard } from '~/shared/ui/EmptyCard'
import { SkeletonBlock } from '~/shared/ui/Skeleton'
import {
  loadPublishModal,
  preloadPublishModal,
} from '~/features/marketplace/ui/publish/loadPublishModal'
import type { PublishModalEditInitialValues } from '~/features/marketplace/ui/publish/PublishModal'
import { lazyNamed } from '~/shared/lib/lazyNamed'
import {
  ACCOUNT_ICON_BUTTON_CLASS,
  AccountIconLink,
  AccountRow,
  AccountStat,
  AccountVisibilityBadge,
} from './accountBadges'

const PublishModal = lazyNamed(loadPublishModal, 'PublishModal')

interface RowProps
{
  template: MarketplaceTemplateManagementItem
  busy: boolean
  onEdit: () => void
  onTogglePublish: () => void
}

type TemplatePublishState =
  | { kind: 'idle' }
  | { kind: 'confirm-unpublish'; slug: string; title: string }
  | { kind: 'pending'; slug: string; action: TemplatePublishAction }

interface TemplatePublishActionMeta
{
  successToast: string
  errorContext: string
}

const TEMPLATE_PUBLISH_ACTION_META: Record<
  TemplatePublishAction,
  TemplatePublishActionMeta
> = {
  unpublish: {
    successToast: 'Template unpublished',
    errorContext: 'unpublishMyTemplate failed',
  },
  republish: {
    successToast: 'Template republished',
    errorContext: 'republishMyTemplate failed',
  },
}

const IDLE_TEMPLATE_PUBLISH_STATE: TemplatePublishState = { kind: 'idle' }

const PUBLISH_TOGGLE_LABEL: Record<TemplatePublishAction, string> = {
  unpublish: 'Unpublish',
  republish: 'Republish',
}

const TemplateRow = ({ template, busy, onEdit, onTogglePublish }: RowProps) =>
{
  const categoryLabel = CATEGORY_META[template.category].label
  const control = getTemplatePublishControl(template)
  const showGalleryLink = canViewTemplateInGallery(template)
  // pending/failed are publish-job states w/ no toggle action — disable the
  // button so it can't tear down an in-flight or failed publish & label it
  // to match the badge
  const toggleDisabled = busy || control.kind !== 'toggle'
  const toggleSpinning = busy || control.kind === 'pending'
  const toggleLabel =
    control.kind === 'pending'
      ? 'Publishing…'
      : control.kind === 'failed'
        ? 'Publish failed'
        : PUBLISH_TOGGLE_LABEL[control.action]
  return (
    <AccountRow
      title={template.title}
      badges={
        <AccountVisibilityBadge
          visibility={template.visibility}
          publicationState={template.publicationState}
        />
      }
      meta={
        <>
          {categoryLabel} · Updated {formatRelativeTime(template.updatedAt)}
        </>
      }
      stats={
        <>
          <AccountStat icon={Layers} value={template.forkCount} label="forks" />
          <AccountStat icon={Eye} value={template.viewCount} label="views" />
          <span className="text-[var(--t-text-faint)]">
            {formatCount(template.weeklyForkCount)} this week
          </span>
        </>
      }
      actions={
        <>
          {showGalleryLink && (
            <AccountIconLink
              to={`${TEMPLATES_ROUTE_PATH}/${template.slug}`}
              ariaLabel={`View ${template.title}`}
              title="View in gallery"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
            </AccountIconLink>
          )}
          <button
            type="button"
            onClick={onEdit}
            onMouseEnter={preloadPublishModal}
            onFocus={preloadPublishModal}
            aria-label={`Edit ${template.title}`}
            title="Edit"
            disabled={busy}
            className={`${ACCOUNT_ICON_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={control.kind === 'toggle' ? onTogglePublish : undefined}
            disabled={toggleDisabled}
            className="focus-custom inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--t-border)] px-2.5 text-xs font-medium text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          >
            {toggleSpinning && (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
            )}
            {toggleLabel}
          </button>
        </>
      }
    />
  )
}

const SkeletonRow = () => (
  <SkeletonBlock
    className="h-[72px] rounded-md border border-[var(--t-border)]"
    tone="soft"
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
  hasCoverMedia: template.coverMedia !== null,
})

export const AccountTemplatesSection = () =>
{
  const list = useMyTemplateManagementList(true)
  const unpublish = useUnpublishMyTemplateMutation()
  const republish = useRepublishMyTemplateMutation()
  const [editTarget, setEditTarget] =
    useState<PublishModalEditInitialValues | null>(null)
  const [publishState, setPublishState] = useState<TemplatePublishState>(
    IDLE_TEMPLATE_PUBLISH_STATE
  )

  const runPublishAction = async (
    action: TemplatePublishAction,
    slug: string
  ) =>
  {
    const meta = TEMPLATE_PUBLISH_ACTION_META[action]
    const mutation = action === 'unpublish' ? unpublish : republish
    setPublishState({ kind: 'pending', slug, action })
    try
    {
      await mutation({ slug })
      toast(meta.successToast, 'success')
    }
    catch (caught)
    {
      logger.error('marketplace', meta.errorContext, caught)
      toast(formatMarketplaceError(caught), 'error')
    }
    finally
    {
      setPublishState(IDLE_TEMPLATE_PUBLISH_STATE)
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
      <EmptyCard
        radius="md"
        padding="sm"
        body="You haven't published any templates yet. Use the publish button on the gallery to share your first one."
      />
    )
  }

  return (
    <>
      <div className="space-y-2">
        {list.items.map((template) =>
        {
          const isBusy =
            publishState.kind === 'pending' &&
            publishState.slug === template.slug
          return (
            <TemplateRow
              key={template.slug}
              template={template}
              busy={isBusy}
              onEdit={() => setEditTarget(toEditInitialValues(template))}
              onTogglePublish={() =>
              {
                const control = getTemplatePublishControl(template)
                if (control.kind !== 'toggle') return
                if (control.action === 'republish')
                {
                  void runPublishAction('republish', template.slug)
                }
                else
                {
                  setPublishState({
                    kind: 'confirm-unpublish',
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
        open={publishState.kind === 'confirm-unpublish'}
        title="Unpublish template?"
        description={`"${publishState.kind === 'confirm-unpublish' ? publishState.title : ''}" will be hidden from the gallery. You can republish it any time.`}
        confirmText="Unpublish"
        onCancel={() => setPublishState(IDLE_TEMPLATE_PUBLISH_STATE)}
        onConfirm={() =>
        {
          if (publishState.kind === 'confirm-unpublish')
          {
            void runPublishAction('unpublish', publishState.slug)
          }
        }}
      />
    </>
  )
}
