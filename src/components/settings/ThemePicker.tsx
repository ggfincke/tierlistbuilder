// src/components/settings/ThemePicker.tsx
// grid of clickable theme preview cards for the Appearance section

import { useSettingsStore } from '../../store/useSettingsStore'
import { THEME_META, THEMES } from '../../theme'

export const ThemePicker = () =>
{
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)

  return (
    <div className="grid grid-cols-4 gap-2">
      {THEME_META.map(({ id, label }) =>
      {
        const t = THEMES[id]
        const isActive = id === themeId

        return (
          <button
            key={id}
            type="button"
            onClick={() => setThemeId(id)}
            className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition ${
              isActive
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
