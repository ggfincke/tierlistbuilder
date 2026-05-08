// src/features/marketplace/components/discovery/SearchInput.tsx
// gallery search wrapper w/ command shortcut enabled

import { SearchField } from '~/shared/ui/SearchField'

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
}: SearchInputProps) => (
  <SearchField
    value={value}
    onChange={onChange}
    label="Search templates"
    placeholder={placeholder}
    size="md"
    commandShortcut
  />
)
