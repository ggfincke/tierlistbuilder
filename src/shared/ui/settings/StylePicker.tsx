// src/shared/ui/settings/StylePicker.tsx
// controlled, data-driven image-style (skin) picker. options come from the
// template's own styles -- no global catalog

import { ImageOff } from 'lucide-react'

import type { TemplateStyleOption } from '@tierlistbuilder/contracts/marketplace/template'
import { PickerGrid } from '~/shared/ui/PickerGrid'

interface StylePickerItem
{
  id: string
  label: string
  previewUrl: string | null
}

const renderStylePreview = (item: StylePickerItem) =>
  item.previewUrl ? (
    <img
      src={item.previewUrl}
      alt=""
      loading="lazy"
      className="h-12 w-12 rounded-md object-cover"
    />
  ) : (
    <span className="grid h-12 w-12 place-items-center rounded-md bg-[rgb(var(--t-overlay)/0.08)] text-[var(--t-text-faint)]">
      <ImageOff className="h-4 w-4" strokeWidth={2} />
    </span>
  )

interface StylePickerProps
{
  options: readonly TemplateStyleOption[]
  value: string
  onChange: (styleExternalId: string) => void
  disabled?: boolean
  columns?: number
  ariaLabelledby?: string
}

export const StylePicker = ({
  options,
  value,
  onChange,
  disabled = false,
  columns,
  ariaLabelledby,
}: StylePickerProps) => (
  <PickerGrid<string, StylePickerItem>
    items={options.map((option) => ({
      id: option.externalId,
      label: option.label,
      previewUrl: option.previewUrl,
    }))}
    activeKey={value}
    onSelect={onChange}
    ariaLabel="Image style"
    ariaLabelledby={ariaLabelledby}
    columns={columns}
    buttonClassName="gap-1.5 p-2"
    renderPreview={renderStylePreview}
    disabled={disabled}
  />
)
