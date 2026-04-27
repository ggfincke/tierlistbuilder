// src/features/workspace/settings/ui/TextStylePicker.tsx
// controlled text-style preview picker for defaults & per-board overrides

import { TEXT_STYLES } from '~/shared/theme/textStyles'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import { PickerGrid } from '~/shared/ui/PickerGrid'

interface StyleOption
{
  id: TextStyleId
  label: string
}

const STYLE_OPTIONS: readonly StyleOption[] = [
  { id: 'default', label: 'Default (Inter)' },
  { id: 'mono', label: 'Mono' },
  { id: 'serif', label: 'Serif' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'display', label: 'Display' },
]

const renderStylePreview = (option: StyleOption) =>
{
  const style = TEXT_STYLES[option.id]
  return (
    <span
      className="text-lg text-[var(--t-text)]"
      style={{
        fontFamily: style.fontFamily,
        fontWeight: Number(style.weightHeading),
      }}
    >
      Aa
    </span>
  )
}

interface TextStylePickerProps
{
  value: TextStyleId
  onChange: (textStyleId: TextStyleId) => void
  disabled?: boolean
  ariaLabelledby?: string
}

export const TextStylePicker = ({
  value,
  onChange,
  disabled = false,
  ariaLabelledby,
}: TextStylePickerProps) => (
  <PickerGrid<TextStyleId, StyleOption>
    items={STYLE_OPTIONS}
    activeKey={value}
    onSelect={onChange}
    ariaLabel="Text style"
    ariaLabelledby={ariaLabelledby}
    buttonClassName="gap-1 px-3 py-2"
    renderPreview={renderStylePreview}
    disabled={disabled}
  />
)
