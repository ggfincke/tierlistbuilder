// src/components/settings/TierSettingsAppearanceTab.tsx
// appearance tab content for app theme, tier color palette, text style, & accessibility

import { useId } from 'react'

import { useSettingsStore } from '../../store/useSettingsStore'
import { PalettePicker } from './PalettePicker'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { TextStylePicker } from './TextStylePicker'
import { ThemePicker } from './ThemePicker'
import { Toggle } from './Toggle'

export const TierSettingsAppearanceTab = () =>
{
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion)
  const themeId = useSettingsStore((s) => s.themeId)
  const toggleHighContrast = useSettingsStore((s) => s.toggleHighContrast)
  const highContrastDescriptionId = useId()
  const reduceMotionDescriptionId = useId()

  const isHighContrast = themeId === 'high-contrast'

  return (
    <>
      <SettingsSection title="App Theme">
        <ThemePicker />
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
