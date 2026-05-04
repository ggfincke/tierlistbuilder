// src/features/library/components/LibrarySearchInput.tsx
// search input for the My Lists page header — compact pill variant

import { Search } from 'lucide-react'

interface LibrarySearchInputProps
{
  value: string
  onChange: (next: string) => void
}

export const LibrarySearchInput = ({
  value,
  onChange,
}: LibrarySearchInputProps) => (
  <label className="focus-custom flex w-full items-center gap-2 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-surface)] px-3.5 py-2 transition focus-within:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)] hover:border-[var(--t-border-hover)] sm:w-[260px]">
    <Search
      className="h-3.5 w-3.5 text-[var(--t-text-faint)]"
      strokeWidth={1.8}
      aria-hidden
    />
    <span className="sr-only">Search your lists</span>
    <input
      type="search"
      value={value}
      placeholder="Search your lists…"
      onChange={(e) => onChange(e.target.value)}
      className="focus-custom flex-1 bg-transparent text-[12px] text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] outline-none"
    />
  </label>
)
