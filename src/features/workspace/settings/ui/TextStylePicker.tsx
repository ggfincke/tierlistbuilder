// src/features/workspace/settings/ui/TextStylePicker.tsx
// row of clickable text style previews for the Appearance section

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
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
  ariaLabelledby?: string
}

export const TextStylePicker = ({ ariaLabelledby }: TextStylePickerProps) =>
{
  const textStyleId = useSettingsStore((s) => s.textStyleId)
  const setTextStyleId = useSettingsStore((s) => s.setTextStyleId)

  return (
    <PickerGrid<TextStyleId, StyleOption>
      items={STYLE_OPTIONS}
      activeKey={textStyleId}
      onSelect={setTextStyleId}
      ariaLabel="Text style"
      ariaLabelledby={ariaLabelledby}
      buttonClassName="gap-1 px-3 py-2"
      renderPreview={renderStylePreview}
    />
  )
}
