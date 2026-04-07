// src/components/ui/EmbedSnippetModal.tsx
// embed snippet modal — generate & copy an iframe embed code

import { useEffect, useId, useRef, useState } from 'react'
import { Check, Code2, Copy } from 'lucide-react'

import { extractBoardData } from '../../domain/boardData'
import { useClipboardCopy } from '../../hooks/useClipboardCopy'
import { useTierListStore } from '../../store/useTierListStore'
import {
  encodeBoardToShareFragment,
  getAppBaseUrl,
} from '../../utils/shareLink'
import { BaseModal } from './BaseModal'
import { SecondaryButton } from './SecondaryButton'
import { TextInput } from './TextInput'

interface EmbedSnippetModalProps
{
  open: boolean
  onClose: () => void
}

// generate the embed iframe code from current board data
const generateEmbedCode = async (
  width: string,
  height: string
): Promise<string> =>
{
  const data = extractBoardData(useTierListStore.getState())
  const fragment = await encodeBoardToShareFragment(data)
  const embedUrl = `${getAppBaseUrl()}?embed=true#share=${fragment}`
  return `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" style="border:none;border-radius:8px;" loading="lazy"></iframe>`
}

export const EmbedSnippetModal = ({
  open,
  onClose,
}: EmbedSnippetModalProps) =>
{
  const titleId = useId()
  const [width, setWidth] = useState('800')
  const [height, setHeight] = useState('450')
  const [embedCode, setEmbedCode] = useState<string | null>(null)
  const { copied, copy } = useClipboardCopy()
  const generationRef = useRef(0)

  // generate the embed code when the modal opens or dimensions change (debounced)
  useEffect(() =>
  {
    if (!open) return

    const generation = ++generationRef.current

    const timer = setTimeout(() =>
    {
      void generateEmbedCode(width, height)
        .then((code) =>
        {
          if (generation !== generationRef.current) return
          setEmbedCode(code)
        })
        .catch(() =>
        {
          if (generation !== generationRef.current) return
          setEmbedCode(null)
        })
    }, 300)

    return () =>
    {
      clearTimeout(timer)
      setEmbedCode(null)
    }
  }, [open, width, height])

  const loading = open && !embedCode

  const handleCopy = () =>
  {
    if (embedCode) void copy(embedCode)
  }

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-lg flex-col p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-[var(--t-accent)]" strokeWidth={1.8} />
          <h2
            id={titleId}
            className="text-lg font-semibold text-[var(--t-text)]"
          >
            Embed Code
          </h2>
        </div>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm text-[var(--t-text-muted)]">Width</label>
        <TextInput
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          className="w-20"
        />
        <label className="text-sm text-[var(--t-text-muted)]">Height</label>
        <TextInput
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="w-20"
        />
      </div>

      {loading && (
        <p className="py-6 text-center text-sm text-[var(--t-text-muted)]">
          Generating embed code…
        </p>
      )}

      {embedCode && (
        <>
          <textarea
            readOnly
            value={embedCode}
            rows={4}
            className="w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2 font-mono text-xs text-[var(--t-text-secondary)] focus:outline-none"
            onFocus={(e) => e.target.select()}
          />
          <div className="mt-3 flex justify-end">
            <SecondaryButton
              variant="surface"
              onClick={() => void handleCopy()}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy Code'}
            </SecondaryButton>
          </div>

          <p className="mt-3 text-xs text-[var(--t-text-faint)]">
            Paste this code into any HTML page to embed a read-only view of your
            tier list. Images are excluded from the embed URL.
          </p>
        </>
      )}
    </BaseModal>
  )
}
