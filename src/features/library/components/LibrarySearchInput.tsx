// src/features/library/components/LibrarySearchInput.tsx
// search input for the My Lists page header — compact pill variant

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
    label="Search your lists"
    placeholder="Search your lists…"
    className="sm:w-[260px]"
  />
)
