// src/features/workspace/sharing/ui/ShareModal.tsx
// share modal — renders local hash-fragment share & embed URLs

import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Link as LinkIcon, RefreshCw } from 'lucide-react'

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import { formatError } from '~/shared/lib/errors'
import { useClipboardCopy } from '~/shared/hooks/useClipboardCopy'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'
import {
  buildAppUrl,
  encodeBoardToShareFragment,
} from '~/features/workspace/sharing/snapshot-compression/hashShare'
import { EMBED_ROUTE_PATH } from '~/app/routes/pathname'

interface ShareModalProps
{
  open: boolean
  onClose: () => void
  getSnapshot: () => BoardSnapshot
}

const buildEmbedSnippet = (embedUrl: string): string =>
  `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`

interface LocalShareLink
{
  shareUrl: string
  embedUrl: string
}

export const ShareModal = ({ open, onClose, getSnapshot }: ShareModalProps) =>
{
  const titleId = useId()
  const shareUrlId = useId()
  const embedSnippetId = useId()

  const [link, setLink] = useState<LocalShareLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const shareCopy = useClipboardCopy()
  const embedCopy = useClipboardCopy()

  // stash the latest getSnapshot in a ref so effects don't depend on the
  // prop identity (parent passes a fresh closure every render). reading
  // through the ref at invocation time still captures the latest board
  const getSnapshotRef = useRef(getSnapshot)
  getSnapshotRef.current = getSnapshot

  // reset state when the modal opens. don't auto-generate so users can choose
  // when the snapshot freezes.
  useEffect(() =>
  {
    if (!open) return
    setLink(null)
    setError(null)
    setGenerating(false)
  }, [open])

  const generate = async (): Promise<void> =>
  {
    setGenerating(true)
    setError(null)
    try
    {
      const fragment = await encodeBoardToShareFragment(
        getSnapshotRef.current()
      )
      setLink({
        shareUrl: `${buildAppUrl('/')}#share=${fragment}`,
        embedUrl: `${buildAppUrl(EMBED_ROUTE_PATH)}#share=${fragment}`,
      })
    }
    catch (err)
    {
      setError(formatError(err, 'Failed to create share link.'))
    }
    finally
    {
      setGenerating(false)
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
        <ModalHeader titleId={titleId}>Share Tier List</ModalHeader>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      <p className="mb-4 text-xs text-[var(--t-text-muted)]">
        Anyone with the link can view a snapshot of this board. The snapshot is
        frozen at the moment of generation. Hash links omit item images so the
        URL stays portable.
      </p>

      {error && (
        <div className="mb-3 rounded-md border border-[var(--t-border-secondary)] bg-[rgb(var(--t-overlay)/0.06)] px-3 py-2 text-xs text-[var(--t-destructive-hover)]">
          {error}
        </div>
      )}

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
