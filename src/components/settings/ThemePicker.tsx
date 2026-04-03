// src/components/settings/ThemePicker.tsx
// grid of clickable theme preview cards for the Appearance section

import { useRef } from 'react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { THEME_META, THEMES } from '../../theme'
import type { ThemeId } from '../../types'
import {
  resolveNextSelectionIndex,
  type SelectionNavigationKey,
} from '../../utils/selectionNavigation'

interface ThemePickerProps
{
  ariaLabelledby?: string
}

export const ThemePicker = ({ ariaLabelledby }: ThemePickerProps) =>
{
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)
  const optionRefs = useRef<Partial<Record<ThemeId, HTMLButtonElement | null>>>(
    {}
  )

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledby}
      aria-label={ariaLabelledby ? undefined : 'App theme'}
      className="grid grid-cols-4 gap-2"
    >
      {THEME_META.map(({ id, label }, index) =>
      {
        const t = THEMES[id]
        const isActive = id === themeId

        return (
          <button
            key={id}
            ref={(node) =>
            {
              optionRefs.current[id] = node
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setThemeId(id)}
            onKeyDown={(event) =>
            {
              const key = event.key as SelectionNavigationKey

              if (
                ![
                  'ArrowLeft',
                  'ArrowRight',
                  'ArrowUp',
                  'ArrowDown',
                  'Home',
                  'End',
                ].includes(key)
              )
              {
                return
              }

              const nextIndex = resolveNextSelectionIndex({
                currentIndex: index,
                itemCount: THEME_META.length,
                key,
                columns: 4,
              })

              if (nextIndex === null)
              {
                return
              }

              event.preventDefault()

              const nextThemeId = THEME_META[nextIndex].id
              setThemeId(nextThemeId)
              optionRefs.current[nextThemeId]?.focus()
            }}
            className={`focus-custom flex flex-col items-center gap-1.5 rounded-lg p-2 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)] ${
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
