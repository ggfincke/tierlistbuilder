// src/features/workspace/settings/ui/ThemePicker.tsx
// grid of clickable theme preview cards for the Appearance section

import { useRovingSelection } from '~/shared/selection/useRovingSelection'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { THEME_META, THEMES } from '~/shared/theme/tokens'
import type { ThemeId } from '@tierlistbuilder/contracts/lib/theme'

const THEME_IDS = THEME_META.map((m) => m.id) as ThemeId[]

interface ThemePickerProps
{
  ariaLabelledby?: string
}

export const ThemePicker = ({ ariaLabelledby }: ThemePickerProps) =>
{
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const { getItemProps, groupProps, isActive } = useRovingSelection({
    items: THEME_IDS,
    activeKey: themeId,
    onSelect: setThemeId,
    kind: 'radio',
    groupLabelledby: ariaLabelledby,
    groupLabel: ariaLabelledby ? undefined : 'App theme',
    columns: 4,
  })

  return (
    <div {...groupProps} className="grid grid-cols-4 gap-2">
      {THEME_META.map(({ id, label }, index) =>
      {
        const t = THEMES[id]
        const itemIsActive = isActive(id)

        return (
          <button
            key={id}
            {...getItemProps(id, index)}
            className={`focus-custom flex flex-col items-center gap-1.5 rounded-lg p-2 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
              itemIsActive
                ? 'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'
                : 'hover:bg-[rgb(var(--t-overlay)/0.06)]'
            }`}
          >
            {/* color preview strip */}
            <div className="flex w-full overflow-hidden rounded">
              <span
                className="h-5 flex-1"
                style={{ background: t['bg-page'] }}
              />
              <span
                className="h-5 flex-1"
                style={{ background: t['bg-surface'] }}
              />
              <span className="h-5 flex-1" style={{ background: t.accent }} />
              <span className="h-5 flex-1" style={{ background: t.text }} />
            </div>
            <span className="text-[10px] text-[var(--t-text-faint)]">
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
