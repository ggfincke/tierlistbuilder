// src/features/library/components/LibrarySearchInput.tsx
// search input for the My Boards page header — compact pill variant

import { SearchField } from '~/shared/ui/SearchField'

interface LibrarySearchInputProps
{
  value: string
  onChange: (next: string) => void
}

export const LibrarySearchInput = ({
  value,
  onChange,
}: LibrarySearchInputProps) => (
  <SearchField
    value={value}
    onChange={onChange}
    label="Search your boards"
    placeholder="Search your boards…"
    className="sm:w-full"
  />
)
