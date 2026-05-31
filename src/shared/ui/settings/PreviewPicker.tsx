// src/shared/ui/settings/PreviewPicker.tsx
// thin PickerGrid wrapper for settings preview pickers

import type { ReactNode } from 'react'

import { PickerGrid } from '~/shared/ui/PickerGrid'

interface PreviewPickerItem<TKey extends string>
{
  id: TKey
  label: string
}

interface PreviewPickerProps<
  TKey extends string,
  TItem extends PreviewPickerItem<TKey>,
>
{
  items: readonly TItem[]
  activeKey: TKey
  onSelect: (key: TKey) => void
  ariaLabel: string
  renderPreview: (item: TItem) => ReactNode
  ariaLabelledby?: string
  columns?: number
  buttonClassName?: string
  disabled?: boolean
}

export function PreviewPicker<
  TKey extends string,
  TItem extends PreviewPickerItem<TKey>,
>({
  items,
  activeKey,
  onSelect,
  ariaLabel,
  renderPreview,
  ariaLabelledby,
  columns,
  buttonClassName,
  disabled = false,
}: PreviewPickerProps<TKey, TItem>)
{
  return (
    <PickerGrid<TKey, TItem>
      items={items}
      activeKey={activeKey}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
      ariaLabelledby={ariaLabelledby}
      columns={columns}
      buttonClassName={buttonClassName}
      renderPreview={renderPreview}
      disabled={disabled}
    />
  )
}
