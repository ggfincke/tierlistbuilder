// src/features/workspace/imageEditor/ui/ImageEditorMetadataPanel.tsx
// single-item metadata: alt text, notes, & background color. mounted only in
// the editor's single-item mode so multi-item auditing stays uncluttered

import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'

import { ColorInput } from '~/shared/ui/ColorInput'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'

export interface ImageEditorMetadataPanelHandle
{
  // commit any in-flight drafts; called on close / item-switch so unsaved
  // typing doesn't get lost between renders
  flushDrafts: () => void
}

interface ImageEditorMetadataPanelProps
{
  itemId: string
  altText: string | undefined
  notes: string | undefined
  backgroundColor: string | undefined
  hasImage: boolean
  onAltTextChange: (value: string) => void
  onNotesChange: (value: string) => void
  onBackgroundColorChange: (value: string | null) => void
  ref?: Ref<ImageEditorMetadataPanelHandle>
}

const DEFAULT_BACKGROUND_PICKER_COLOR = '#3b82f6'

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
    {children}
  </span>
)

export const ImageEditorMetadataPanel = ({
  itemId,
  altText,
  notes,
  backgroundColor,
  hasImage,
  onAltTextChange,
  onNotesChange,
  onBackgroundColorChange,
  ref,
}: ImageEditorMetadataPanelProps) =>
{
  const altInputId = useId()
  const notesInputId = useId()
  const colorInputId = useId()

  const [altDraft, setAltDraft] = useState(altText ?? '')
  const [notesDraft, setNotesDraft] = useState(notes ?? '')

  // reset drafts when the active item changes — single-mode usually opens
  // w/ one item, but the rail-less path still allows a rare item swap
  useEffect(() =>
  {
    setAltDraft(altText ?? '')
    setNotesDraft(notes ?? '')
  }, [itemId, altText, notes])

  const altDraftRef = useRef(altDraft)
  const notesDraftRef = useRef(notesDraft)
  useEffect(() =>
  {
    altDraftRef.current = altDraft
  }, [altDraft])
  useEffect(() =>
  {
    notesDraftRef.current = notesDraft
  }, [notesDraft])

  const flushAlt = () =>
  {
    const committed = altText ?? ''
    if (altDraftRef.current === committed) return
    onAltTextChange(altDraftRef.current)
  }

  const flushNotes = () =>
  {
    const committed = notes ?? ''
    if (notesDraftRef.current === committed) return
    onNotesChange(notesDraftRef.current)
  }

  useImperativeHandle(
    ref,
    () => ({
      flushDrafts: () =>
      {
        flushAlt()
        flushNotes()
      },
    }),
    // flushAlt/flushNotes close over latest drafts via refs, so deps stay empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // commit pending edits when the panel unmounts (modal close, item swap)
  useEffect(
    () => () =>
    {
      flushAlt()
      flushNotes()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const backgroundValue = backgroundColor ?? DEFAULT_BACKGROUND_PICKER_COLOR
  const showClearBackground = Boolean(backgroundColor)

  return (
    <section
      aria-label="Item metadata"
      className="border-t border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)]/30 px-5 py-4"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              className="flex items-center justify-between"
              htmlFor={altInputId}
            >
              <Eyebrow>Alt text</Eyebrow>
              <span className="font-mono text-[10px] tabular-nums text-[var(--t-text-faint)]">
                {altDraft.length}/200
              </span>
            </label>
            <TextInput
              id={altInputId}
              value={altDraft}
              onChange={(e) => setAltDraft(e.target.value)}
              onBlur={flushAlt}
              placeholder={
                hasImage
                  ? 'Describe this image for screen readers…'
                  : 'Optional description'
              }
              maxLength={200}
              size="sm"
              variant="surface"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="flex items-center justify-between"
              htmlFor={notesInputId}
            >
              <Eyebrow>Notes</Eyebrow>
              <span className="font-mono text-[10px] tabular-nums text-[var(--t-text-faint)]">
                {notesDraft.length}/2000
              </span>
            </label>
            <TextArea
              id={notesInputId}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={flushNotes}
              placeholder="Private — only you see this. Why did you rank this here?"
              maxLength={2000}
              rows={3}
              size="sm"
              variant="surface"
              className="w-full resize-y"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Eyebrow>Background</Eyebrow>
          <div className="flex items-center gap-2">
            <ColorInput
              id={colorInputId}
              value={backgroundValue}
              onChange={(e) => onBackgroundColorChange(e.target.value)}
              size="md"
              aria-label="Item background color"
            />
            <span
              className="font-mono text-xs tabular-nums text-[var(--t-text-secondary)]"
              aria-hidden="true"
            >
              {backgroundColor ? backgroundColor.toUpperCase() : 'None'}
            </span>
          </div>
          {showClearBackground && (
            <SecondaryButton
              size="sm"
              variant="surface"
              onClick={() => onBackgroundColorChange(null)}
            >
              Clear
            </SecondaryButton>
          )}
          <p className="text-[11px] leading-snug text-[var(--t-text-muted)]">
            {hasImage
              ? 'Falls behind the image — visible when zoom or fit leaves edges.'
              : 'Tile background for text-only items.'}
          </p>
        </div>
      </div>
    </section>
  )
}
