// src/components/settings/TextStylePicker.tsx
// row of clickable text style previews for the Appearance section

import { useSettingsStore } from '../../store/useSettingsStore'
import { TEXT_STYLES } from '../../theme'
import type { TextStyleId } from '../../types'

const STYLE_OPTIONS: { id: TextStyleId; label: string }[] = [
  { id: 'default', label: 'Default (Inter)' },
  { id: 'mono', label: 'Mono' },
  { id: 'serif', label: 'Serif' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'display', label: 'Display' },
]

export const TextStylePicker = () =>
{
  const textStyleId = useSettingsStore((s) => s.textStyleId)
  const setTextStyleId = useSettingsStore((s) => s.setTextStyleId)

  return (
    <div className="flex gap-2">
      {STYLE_OPTIONS.map(({ id, label }) =>
      {
        const style = TEXT_STYLES[id]
        const isActive = id === textStyleId

        return (
          <button
            key={id}
            type="button"
            onClick={() => setTextStyleId(id)}
            className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition ${
              isActive
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
