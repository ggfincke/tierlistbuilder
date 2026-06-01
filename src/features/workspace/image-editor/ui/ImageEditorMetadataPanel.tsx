// src/features/workspace/image-editor/ui/ImageEditorMetadataPanel.tsx
// single-item metadata: alt text, notes, & background color. mounted only in
// the editor's single-item mode so multi-item auditing stays uncluttered

import { useEffect, useId, useImperativeHandle } from 'react'
import type { Ref } from 'react'

import {
  AUTO_PLATE_UNIFORM_DARK_DEFAULT,
  AUTO_PLATE_UNIFORM_DEFAULT,
  type MediaPlate,
} from '@tierlistbuilder/contracts/workspace/board'
import { ColorInput } from '~/shared/ui/ColorInput'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'
import { useFlushableTextDraft } from '~/shared/hooks/useFlushableTextDraft'

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
  // analysis recommendation for transparent logos; drives the Recommended
  // shortcut. absent -> the image is already readable, so no shortcut shows
  mediaPlate: MediaPlate | undefined
  hasImage: boolean
  onAltTextChange: (value: string) => void
  onNotesChange: (value: string) => void
  onBackgroundColorChange: (value: string | null) => void
  ref?: Ref<ImageEditorMetadataPanelHandle>
}

const DEFAULT_BACKGROUND_PICKER_COLOR = '#3b82f6'

// concrete contrasting backdrops the Recommended shortcut writes as a per-item
// backgroundColor, keyed by the analysis result. fixed hex (not theme tokens)
// since a stored backgroundColor must be portable across themes & exports
const RECOMMENDED_PLATE_COLOR: Record<MediaPlate, string> = {
  light: AUTO_PLATE_UNIFORM_DEFAULT,
  dark: AUTO_PLATE_UNIFORM_DARK_DEFAULT,
}

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
  mediaPlate,
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

  const {
    value: altDraft,
    setValue: setAltDraft,
    flush: flushAlt,
  } = useFlushableTextDraft({
    value: altText,
    resetKey: itemId,
    onCommit: onAltTextChange,
  })
  const {
    value: notesDraft,
    setValue: setNotesDraft,
    flush: flushNotes,
  } = useFlushableTextDraft({
    value: notes,
    resetKey: itemId,
    onCommit: onNotesChange,
  })

  useImperativeHandle(
    ref,
    () => ({
      flushDrafts: () =>
      {
        flushAlt()
        flushNotes()
      },
    }),
    [flushAlt, flushNotes]
  )

  // commit pending edits when the panel unmounts (modal close, item swap)
  useEffect(
    () => () =>
    {
      flushAlt()
      flushNotes()
    },
    [flushAlt, flushNotes]
  )

  const backgroundValue = backgroundColor ?? DEFAULT_BACKGROUND_PICKER_COLOR
  const showClearBackground = Boolean(backgroundColor)
  // the analysis-suggested backdrop for a transparent logo, if any
  const suggestedColor =
    hasImage && mediaPlate ? RECOMMENDED_PLATE_COLOR[mediaPlate] : null
  // surface the shortcut only when the current background doesn't already match
  const recommendedColor =
    suggestedColor !== null &&
    backgroundColor?.toLowerCase() !== suggestedColor.toLowerCase()
      ? suggestedColor
      : null

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
                  ? 'Describe this image for screen readers...'
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
              placeholder="Private - only you see this. Why did you rank this here?"
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
          {recommendedColor && (
            <SecondaryButton
              size="sm"
              variant="surface"
              onClick={() => onBackgroundColorChange(recommendedColor)}
            >
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-3 w-3 rounded-sm border border-[var(--t-border)] align-[-1px]"
                style={{ backgroundColor: recommendedColor }}
              />
              Recommended
            </SecondaryButton>
          )}
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
              ? 'Sits behind the image - fills transparent areas & letterbox edges.'
              : 'Tile background for text-only items.'}
          </p>
        </div>
      </div>
    </section>
  )
}
