// src/components/ui/ShareLinkModal.tsx
// share link modal — generate, display, & copy a compressed shareable URL

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Copy, Link } from 'lucide-react'

import { extractBoardData } from '../../domain/boardData'
import { useClipboardCopy } from '../../hooks/useClipboardCopy'
import { useTierListStore } from '../../store/useTierListStore'
import { getShareUrl } from '../../utils/shareLink'
import { BaseModal } from './BaseModal'
import { SecondaryButton } from './SecondaryButton'

interface ShareLinkModalProps
{
  open: boolean
  onClose: () => void
}

export const ShareLinkModal = ({ open, onClose }: ShareLinkModalProps) =>
{
  const titleId = useId()
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasImages, setHasImages] = useState(false)
  const { copied, copy } = useClipboardCopy()
  const generationRef = useRef(0)

  // generate the share URL when the modal opens
  useEffect(() =>
  {
    if (!open) return

    const generation = ++generationRef.current

    const data = extractBoardData(useTierListStore.getState())

    void getShareUrl(data)
      .then((url) =>
      {
        if (generation !== generationRef.current) return
        setShareUrl(url)
        setError(null)
        setHasImages(Object.values(data.items).some((item) => !!item.imageUrl))
      })
      .catch(() =>
      {
        if (generation !== generationRef.current) return
        setShareUrl(null)
        setError('Failed to generate share link.')
      })
  }, [open])

  const loading = open && !shareUrl && !error

  const handleCopy = async () =>
  {
    if (!shareUrl) return
    const ok = await copy(shareUrl)
    if (!ok) setError('Failed to copy to clipboard.')
  }

  const urlSizeKb = useMemo(
    () =>
      shareUrl
        ? (new TextEncoder().encode(shareUrl).length / 1024).toFixed(1)
        : null,
    [shareUrl]
  )

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-lg flex-col p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link className="h-5 w-5 text-[var(--t-accent)]" strokeWidth={1.8} />
          <h2
            id={titleId}
            className="text-lg font-semibold text-[var(--t-text)]"
          >
            Share Link
          </h2>
        </div>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      {loading && (
        <p className="py-6 text-center text-sm text-[var(--t-text-muted)]">
          Generating link…
        </p>
      )}

      {error && (
        <p className="py-4 text-center text-sm text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]">
          {error}
        </p>
      )}

      {shareUrl && (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="min-w-0 flex-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2 text-xs text-[var(--t-text-secondary)] focus:outline-none"
              onFocus={(e) => e.target.select()}
            />
            <SecondaryButton
              variant="surface"
              onClick={() => void handleCopy()}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </SecondaryButton>
          </div>

          {urlSizeKb && (
            <p className="mt-2 text-xs text-[var(--t-text-faint)]">
              Link size: ~{urlSizeKb} KB
            </p>
          )}

          {hasImages && (
            <p className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--t-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--t-accent)_8%,transparent)] px-3 py-2 text-xs text-[var(--t-text-secondary)]">
              Images are excluded from the share link to keep URLs short.
              Recipients will see text labels &amp; colors for image items.
            </p>
          )}
        </>
      )}
    </BaseModal>
  )
}
