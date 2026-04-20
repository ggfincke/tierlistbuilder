// src/features/workspace/sharing/ui/RecentSharesModal.tsx
// modal listing live snapshot share links w/ copy & revoke actions.
// driven by useListMyShortLinks so other tabs reflect changes automatically. signed-in only

import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react'

import {
  revokeShortLinkImperative,
  useListMyShortLinks,
} from '~/features/workspace/sharing/short-link/shortLinkRepository'
import { getShareUrlFromSlug } from '~/features/workspace/sharing/short-link/shortLinkShare'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { toast } from '~/shared/notifications/useToastStore'

interface RecentSharesModalProps
{
  open: boolean
  onClose: () => void
  enabled: boolean
}

const COPIED_FEEDBACK_MS = 2000

const formatAbsoluteDate = (epochMs: number): string =>
{
  const target = new Date(epochMs)
  return target.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      target.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

interface PendingRevoke
{
  slug: string
  boardTitle: string
}

export const RecentSharesModal = ({
  open,
  onClose,
  enabled,
}: RecentSharesModalProps) =>
{
  const titleId = useId()
  const shares = useListMyShortLinks(enabled)

  // per-row in-flight tracking by slug. Set membership tells the row
  // whether its revoke button should render the spinner
  const [revokingSlugs, setRevokingSlugs] = useState<Set<string>>(new Set())
  const [confirmRevoke, setConfirmRevoke] = useState<PendingRevoke | null>(null)
  // last-copied slug + clear timer drive the transient "Copied" feedback.
  // single ref across all rows is fine since copy actions are one-at-a-time
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  useEffect(
    () => () =>
    {
      if (copyTimerRef.current)
      {
        clearTimeout(copyTimerRef.current)
      }
    },
    []
  )

  const updateRevoking = (slug: string, action: 'add' | 'delete'): void =>
  {
    setRevokingSlugs((current) =>
    {
      const has = current.has(slug)
      if (action === 'add' && has) return current
      if (action === 'delete' && !has) return current
      const next = new Set(current)
      if (action === 'add') next.add(slug)
      else next.delete(slug)
      return next
    })
  }

  const handleCopy = async (slug: string): Promise<void> =>
  {
    const url = getShareUrlFromSlug(slug)
    try
    {
      await navigator.clipboard.writeText(url)
      setCopiedSlug(slug)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(
        () => setCopiedSlug(null),
        COPIED_FEEDBACK_MS
      )
    }
    catch (error)
    {
      console.warn('Copy share link failed:', error)
      toast('Failed to copy link.', 'error')
    }
  }

  const handleRevokeRequest = (target: PendingRevoke): void =>
  {
    setConfirmRevoke(target)
  }

  const handleRevokeConfirm = async (): Promise<void> =>
  {
    if (!confirmRevoke) return
    const target = confirmRevoke
    setConfirmRevoke(null)
    updateRevoking(target.slug, 'add')
    try
    {
      await revokeShortLinkImperative({ slug: target.slug })
      toast(`Share for "${target.boardTitle}" was revoked.`, 'success')
    }
    catch (error)
    {
      console.warn('Revoke share failed:', error)
      toast('Failed to revoke share.', 'error')
    }
    finally
    {
      updateRevoking(target.slug, 'delete')
    }
  }

  const renderBody = () =>
  {
    if (shares === undefined)
    {
      return (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-4 w-4 animate-spin text-[var(--t-text-muted)]" />
          <span className="ml-2 text-sm text-[var(--t-text-muted)]">
            Loading…
          </span>
        </div>
      )
    }

    if (shares.length === 0)
    {
      return (
        <p className="py-8 text-center text-sm text-[var(--t-text-muted)]">
          You haven't created any share links yet.
        </p>
      )
    }

    return (
      <div className="max-h-[60vh] overflow-y-auto">
        {shares.map((share) =>
        {
          const revoking = revokingSlugs.has(share.slug)
          const copied = copiedSlug === share.slug
          const label = share.boardTitle?.trim() || 'Untitled'
          const expiresLabel =
            share.expiresAt === null
              ? 'Persistent'
              : `Expires ${formatAbsoluteDate(share.expiresAt)}`
          return (
            <div
              key={share.slug}
              className="flex items-center gap-3 border-b border-[var(--t-border)] px-1 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--t-text)]">
                  {label}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--t-text-muted)]">
                  <span className="font-mono">{share.slug}</span>
                  <span aria-hidden>·</span>
                  <span>Created {formatAbsoluteDate(share.createdAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{expiresLabel}</span>
                </div>
              </div>
              <SecondaryButton
                size="sm"
                variant="surface"
                disabled={revoking}
                onClick={() =>
                {
                  void handleCopy(share.slug)
                }}
                aria-label={`Copy share link for ${label}`}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[var(--t-accent)]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                variant="surface"
                tone="destructive"
                disabled={revoking}
                onClick={() =>
                  handleRevokeRequest({
                    slug: share.slug,
                    boardTitle: label,
                  })
                }
                aria-label={`Revoke share for ${label}`}
              >
                {revoking ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Revoke
              </SecondaryButton>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <BaseModal
        open={open}
        onClose={onClose}
        labelledBy={titleId}
        panelClassName="flex w-full max-w-xl flex-col p-4"
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <ModalHeader titleId={titleId}>Recent shares</ModalHeader>
          <SecondaryButton size="sm" onClick={onClose}>
            Done
          </SecondaryButton>
        </div>
        <p className="mb-3 text-xs text-[var(--t-text-muted)]">
          Snapshot links you've created. Each one expires on the date shown
          unless revoked. Revoking removes the snapshot — recipients see a
          not-found page.
        </p>
        {renderBody()}
      </BaseModal>

      {confirmRevoke && (
        <ConfirmDialog
          open
          title="Revoke share?"
          description={`The link for "${confirmRevoke.boardTitle}" will stop working immediately. Recipients will see a not-found page.`}
          confirmText="Revoke"
          onCancel={() => setConfirmRevoke(null)}
          onConfirm={() =>
          {
            void handleRevokeConfirm()
          }}
        />
      )}
    </>
  )
}
