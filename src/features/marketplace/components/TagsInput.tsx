// src/features/marketplace/components/TagsInput.tsx
// chip-list tag editor used by the publish modal — comma / enter / blur
// commit a draft into the array; click on a chip removes it

import { X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'

import {
  MAX_TEMPLATE_TAGS,
  MAX_TEMPLATE_TAG_LENGTH,
} from '@tierlistbuilder/contracts/marketplace/template'
import { TextInput } from '~/shared/ui/TextInput'

interface TagsInputProps
{
  value: readonly string[]
  onChange: (next: string[]) => void
  // displayed when the input has focus & no draft text — keeps the field
  // discoverable w/o crowding it w/ help copy at rest
  placeholder?: string
  ariaLabel?: string
}

const normalizeTag = (raw: string): string =>
  raw.trim().toLowerCase().slice(0, MAX_TEMPLATE_TAG_LENGTH)

export const TagsInput = ({
  value,
  onChange,
  placeholder = 'Add a tag…',
  ariaLabel = 'Template tags',
}: TagsInputProps) =>
{
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const commitDraft = () =>
  {
    const tag = normalizeTag(draft)
    if (!tag) return
    if (value.length >= MAX_TEMPLATE_TAGS) return
    if (value.includes(tag)) return
    onChange([...value, tag])
    setDraft('')
  }

  const removeTag = (tag: string) =>
  {
    onChange(value.filter((t) => t !== tag))
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) =>
  {
    if (e.key === 'Enter' || e.key === ',')
    {
      e.preventDefault()
      commitDraft()
    }
    else if (
      e.key === 'Backspace' &&
      draft.length === 0 &&
      value.length > 0
    )
    {
      e.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  const reachedLimit = value.length >= MAX_TEMPLATE_TAGS

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {ariaLabel}
      </label>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2 py-1.5 transition focus-within:border-[var(--t-border-hover)]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--t-overlay)/0.06)] px-2 py-0.5 text-xs text-[var(--t-text-secondary)]"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={(e) =>
              {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="focus-custom flex h-3 w-3 items-center justify-center rounded-full text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            >
              <X className="h-2.5 w-2.5" strokeWidth={2} />
            </button>
          </span>
        ))}
        <TextInput
          ref={inputRef}
          id={inputId}
          variant="ghost"
          size="xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commitDraft}
          placeholder={reachedLimit ? '' : placeholder}
          disabled={reachedLimit}
          maxLength={MAX_TEMPLATE_TAG_LENGTH}
          className="flex-1 !border-0 !bg-transparent !p-0 min-w-[6rem]"
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--t-text-faint)]">
        <span>
          {value.length}/{MAX_TEMPLATE_TAGS} tags
        </span>
        <span>Press enter or comma to add</span>
      </div>
    </div>
  )
}
