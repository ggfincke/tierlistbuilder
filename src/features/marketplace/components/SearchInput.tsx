// src/features/marketplace/components/SearchInput.tsx
// gallery hero search box w/ a leading search glyph & clear-on-escape

import { Search, X } from 'lucide-react'
import { useId, useRef } from 'react'

interface SearchInputProps
{
  value: string
  onChange: (next: string) => void
  placeholder?: string
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Search templates…',
}: SearchInputProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()

  const clear = () =>
  {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-4 py-2.5 transition focus-within:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[rgb(var(--t-accent)/0.4)]">
      <span
        aria-hidden="true"
        className="flex h-4 w-4 items-center justify-center text-[var(--t-text-faint)]"
      >
        <Search className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <label htmlFor={labelId} className="sr-only">
        Search templates
      </label>
      <input
        ref={inputRef}
        id={labelId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) =>
        {
          if (e.key === 'Escape' && value)
          {
            e.preventDefault()
            clear()
          }
        }}
        placeholder={placeholder}
        className="focus-custom flex-1 bg-transparent text-sm text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-faint)]"
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="focus-custom flex h-5 w-5 items-center justify-center rounded-full text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
