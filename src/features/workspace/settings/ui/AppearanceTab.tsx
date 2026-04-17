// src/features/workspace/settings/ui/AppearanceTab.tsx
// appearance tab content for app theme, tier color palette, text style, & accessibility

import { useId } from 'react'
import { RotateCcw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { ColorInput } from '~/shared/ui/ColorInput'
import { THEMES } from '~/shared/theme/tokens'
import { PalettePicker } from './PalettePicker'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { TextStylePicker } from './TextStylePicker'
import { ThemePicker } from './ThemePicker'
import { Toggle } from './Toggle'

export const AppearanceTab = () =>
{
  const {
    reducedMotion,
    setReducedMotion,
    themeId,
    boardBackgroundOverride,
    setBoardBackgroundOverride,
    toggleHighContrast,
  } = useSettingsStore(
    useShallow((s) => ({
      reducedMotion: s.reducedMotion,
      setReducedMotion: s.setReducedMotion,
      themeId: s.themeId,
      boardBackgroundOverride: s.boardBackgroundOverride,
      setBoardBackgroundOverride: s.setBoardBackgroundOverride,
      toggleHighContrast: s.toggleHighContrast,
    }))
  )
  const highContrastDescriptionId = useId()
  const reduceMotionDescriptionId = useId()

  const isHighContrast = themeId === 'high-contrast'

  return (
    <>
      <SettingsSection title="App Theme">
        <ThemePicker />

        <SettingRow label="Page Background">
          {(labelId) => (
            <div className="flex items-center gap-2">
              {boardBackgroundOverride !== null && (
                <button
                  type="button"
                  onClick={() => setBoardBackgroundOverride(null)}
                  aria-label="Reset page background to theme default"
                  className="rounded p-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                  title="Reset to theme default"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <ColorInput
                value={boardBackgroundOverride ?? THEMES[themeId]['bg-page']}
                onChange={(e) => setBoardBackgroundOverride(e.target.value)}
                aria-labelledby={labelId}
              />
            </div>
          )}
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Tier Color Palette">
        <PalettePicker />
      </SettingsSection>

      <SettingsSection title="Text Style">
        <TextStylePicker />
      </SettingsSection>

      <SettingsSection title="Accessibility">
        <SettingRow label="High Contrast">
          <Toggle
            checked={isHighContrast}
            onChange={toggleHighContrast}
            ariaDescribedby={highContrastDescriptionId}
          />
        </SettingRow>
        <p
          id={highContrastDescriptionId}
          className="mb-3 mt-1 text-xs text-[var(--t-text-muted)]"
        >
          Stronger borders, brighter focus rings, & maximum text contrast.
        </p>

        <SettingRow label="Reduce Motion">
          <Toggle
            checked={reducedMotion}
            onChange={setReducedMotion}
            ariaDescribedby={reduceMotionDescriptionId}
          />
        </SettingRow>
        <p
          id={reduceMotionDescriptionId}
          className="mt-1 text-xs text-[var(--t-text-muted)]"
        >
          Disables animations & transitions. Also respects your OS setting.
        </p>
      </SettingsSection>
    </>
  )
}
