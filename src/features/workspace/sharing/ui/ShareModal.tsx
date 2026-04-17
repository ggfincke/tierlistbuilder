// src/features/workspace/sharing/ui/ShareModal.tsx
// share modal — shows a Generate button, then renders the minted URL + embed
// snippet. generation is explicit (not auto on open) so each modal open
// doesn't create a fresh shortLinks row + _storage blob for the same board
// content. aborts in-flight work on unmount & on supersession

import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Link as LinkIcon, RefreshCw } from 'lucide-react'

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { useClipboardCopy } from '~/shared/hooks/useClipboardCopy'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'
import {
  createBoardShortLink,
  type ShortLinkCreateResult,
} from '~/features/workspace/sharing/lib/shortLinkShare'

interface ShareModalProps
{
  open: boolean
  onClose: () => void
  // resolved on demand so we always serialize the latest board state at
  // generation time, not whatever was current when the modal mounted
  getSnapshot: () => BoardSnapshot
}

const buildEmbedSnippet = (embedUrl: string): string =>
  `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`

export const ShareModal = ({ open, onClose, getSnapshot }: ShareModalProps) =>
{
  const titleId = useId()
  const shareUrlId = useId()
  const embedSnippetId = useId()

  const [link, setLink] = useState<ShortLinkCreateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const shareCopy = useClipboardCopy()
  const embedCopy = useClipboardCopy()

  // stash the latest getSnapshot in a ref so effects don't depend on the
  // prop identity (parent passes a fresh closure every render). reading
  // through the ref at invocation time still captures the latest board
  const getSnapshotRef = useRef(getSnapshot)
  getSnapshotRef.current = getSnapshot

  // tracks the active generation's abort controller — supersedes aborts the
  // previous one so only the newest fetch can complete & write state
  const activeAbortRef = useRef<AbortController | null>(null)

  // reset state when the modal opens. don't auto-generate — explicit user
  // click is required, which eliminates the "open/close churn creates
  // orphaned blobs" abuse path
  useEffect(() =>
  {
    if (!open) return
    setLink(null)
    setError(null)
    setGenerating(false)

    return () =>
    {
      // modal closed (or unmounted) — abort any in-flight generation so
      // the upload + createShortLink chain doesn't continue after dismiss
      activeAbortRef.current?.abort()
      activeAbortRef.current = null
    }
  }, [open])

  const generate = async (): Promise<void> =>
  {
    activeAbortRef.current?.abort()
    const controller = new AbortController()
    activeAbortRef.current = controller
    setGenerating(true)
    setError(null)
    try
    {
      const result = await createBoardShortLink(
        getSnapshotRef.current(),
        controller.signal
      )
      if (controller.signal.aborted) return
      setLink(result)
    }
    catch (err)
    {
      if (controller.signal.aborted) return
      const message =
        err instanceof Error ? err.message : 'Failed to create share link.'
      setError(message)
    }
    finally
    {
      if (!controller.signal.aborted) setGenerating(false)
      if (activeAbortRef.current === controller) activeAbortRef.current = null
    }
  }

  const handleCopyShare = (): void =>
  {
    if (!link) return
    void shareCopy.copy(link.shareUrl)
  }

  const handleCopyEmbed = (): void =>
  {
    if (!link) return
    void embedCopy.copy(buildEmbedSnippet(link.embedUrl))
  }

  const hasLink = link !== null

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-lg flex-col p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
          Share Tier List
        </h2>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      <p className="mb-4 text-xs text-[var(--t-text-muted)]">
        Anyone w/ the link can view a snapshot of this board. The snapshot is
        frozen at the moment of generation — edits made afterward won't appear
        in already-shared links.
      </p>

      {error && (
        <div className="mb-3 rounded-md border border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.06)] px-3 py-2 text-xs text-[var(--t-destructive-hover)]">
          {error}
        </div>
      )}

      {/* initial state: single Generate CTA. explicit click avoids the
          open-churn orphan path a prior auto-on-open design had */}
      {!hasLink && !generating && !error && (
        <div className="flex justify-center py-6">
          <PrimaryButton onClick={() => void generate()}>
            <LinkIcon className="h-3.5 w-3.5" />
            Generate share link
          </PrimaryButton>
        </div>
      )}

      {generating && !hasLink && (
        <div className="flex items-center justify-center py-6 text-sm text-[var(--t-text-muted)]">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          Generating…
        </div>
      )}

      {hasLink && (
        <>
          <label
            htmlFor={shareUrlId}
            className="mb-1 block text-xs font-medium text-[var(--t-text-secondary)]"
          >
            Shareable link
          </label>
          <div className="mb-4 flex items-center gap-2">
            <TextInput
              id={shareUrlId}
              type="text"
              readOnly
              value={link.shareUrl}
              className="min-w-0 flex-1 font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <SecondaryButton
              variant="surface"
              onClick={handleCopyShare}
              aria-label="Copy share link"
            >
              {shareCopy.copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--t-accent)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {shareCopy.copied ? 'Copied' : 'Copy'}
            </SecondaryButton>
          </div>

          <label
            htmlFor={embedSnippetId}
            className="mb-1 block text-xs font-medium text-[var(--t-text-secondary)]"
          >
            Embed code
          </label>
          <div className="mb-4 flex items-stretch gap-2">
            <TextArea
              id={embedSnippetId}
              readOnly
              rows={3}
              value={buildEmbedSnippet(link.embedUrl)}
              className="flex-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <SecondaryButton
              variant="surface"
              onClick={handleCopyEmbed}
              aria-label="Copy embed code"
            >
              {embedCopy.copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--t-accent)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {embedCopy.copied ? 'Copied' : 'Copy'}
            </SecondaryButton>
          </div>

          <div className="flex items-center justify-end">
            <SecondaryButton
              variant="surface"
              onClick={() => void generate()}
              disabled={generating}
            >
              {generating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LinkIcon className="h-3.5 w-3.5" />
              )}
              {generating ? 'Generating…' : 'Generate new link'}
            </SecondaryButton>
          </div>
        </>
      )}
    </BaseModal>
  )
}
