// src/shared/ui/SearchField.tsx
// pill-shaped search input w/ clear affordance & optional command shortcut

import { Search, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import { matchShortcut } from '~/shared/lib/keyboardShortcut'
import { IS_MAC } from '~/shared/lib/platform'

type SearchFieldSize = 'sm' | 'md'

interface SearchFieldProps
{
  value: string
  onChange: (next: string) => void
  label: string
  placeholder?: string
  size?: SearchFieldSize
  className?: string
  inputClassName?: string
  commandShortcut?: boolean
}

const SIZE_CLASS: Record<SearchFieldSize, string> = {
  sm: 'px-3.5 py-2',
  md: 'px-4 py-2.5',
}

const INPUT_SIZE_CLASS: Record<SearchFieldSize, string> = {
  sm: 'text-[12px]',
  md: 'text-sm',
}

export const SearchField = ({
  value,
  onChange,
  label,
  placeholder,
  size = 'sm',
  className,
  inputClassName,
  commandShortcut = false,
}: SearchFieldProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()

  useEffect(() =>
  {
    if (!commandShortcut) return

    const handler = (event: KeyboardEvent) =>
    {
      if (matchShortcut(event, { key: 'k', mod: true }))
      {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () =>
    {
      window.removeEventListener('keydown', handler)
    }
  }, [commandShortcut])

  const clear = () =>
  {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div
      className={joinClassNames(
        'flex w-full items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] transition focus-within:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)] hover:border-[var(--t-border-hover)]',
        SIZE_CLASS[size],
        className
      )}
    >
      <Search
        className="h-3.5 w-3.5 text-[var(--t-text-faint)]"
        strokeWidth={1.8}
        aria-hidden
      />
      <label htmlFor={labelId} className="sr-only">
        {label}
      </label>
      <input
        ref={inputRef}
        id={labelId}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) =>
        {
          if (event.key === 'Escape' && value)
          {
            event.preventDefault()
            clear()
          }
        }}
        className={joinClassNames(
          'focus-custom min-w-0 flex-1 bg-transparent text-[var(--t-text)] outline-none placeholder:text-[var(--t-text-faint)]',
          INPUT_SIZE_CLASS[size],
          inputClassName
        )}
        autoComplete="off"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={clear}
          className="focus-custom flex h-5 w-5 items-center justify-center rounded-full text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : commandShortcut ? (
        <kbd
          aria-hidden="true"
          className="hidden items-center gap-0.5 rounded border border-[var(--t-border)] bg-[var(--t-bg-page)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--t-text-faint)] sm:inline-flex"
        >
          {IS_MAC ? 'Cmd' : 'Ctrl'}K
        </kbd>
      ) : null}
    </div>
  )
}
