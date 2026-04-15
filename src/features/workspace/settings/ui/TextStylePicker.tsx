// src/features/workspace/settings/ui/TextStylePicker.tsx
// row of clickable text style previews for the Appearance section

import { useRovingSelection } from '@/shared/selection/useRovingSelection'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { TEXT_STYLES } from '@/shared/theme'
import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'

const STYLE_OPTIONS: { id: TextStyleId; label: string }[] = [
  { id: 'default', label: 'Default (Inter)' },
  { id: 'mono', label: 'Mono' },
  { id: 'serif', label: 'Serif' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'display', label: 'Display' },
]

const STYLE_IDS = STYLE_OPTIONS.map((o) => o.id) as TextStyleId[]

interface TextStylePickerProps
{
  ariaLabelledby?: string
}

export const TextStylePicker = ({ ariaLabelledby }: TextStylePickerProps) =>
{
  const textStyleId = useSettingsStore((s) => s.textStyleId)
  const setTextStyleId = useSettingsStore((s) => s.setTextStyleId)
  const { getItemProps, groupProps, isActive } = useRovingSelection({
    items: STYLE_IDS,
    activeKey: textStyleId,
    onSelect: setTextStyleId,
    kind: 'radio',
    groupLabelledby: ariaLabelledby,
    groupLabel: ariaLabelledby ? undefined : 'Text style',
  })

  return (
    <div {...groupProps} className="flex gap-2">
      {STYLE_OPTIONS.map(({ id, label }, index) =>
      {
        const style = TEXT_STYLES[id]
        const itemIsActive = isActive(id)

        return (
          <button
            key={id}
            {...getItemProps(id, index)}
            className={`focus-custom flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
              itemIsActive
                ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                : 'hover:bg-[rgb(var(--t-overlay)/0.06)]'
            }`}
          >
            <span
              className="text-lg text-[var(--t-text)]"
              style={{
                fontFamily: style.fontFamily,
                fontWeight: Number(style.weightHeading),
              }}
            >
              Aa
            </span>
            <span className="text-[10px] text-[var(--t-text-faint)]">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
