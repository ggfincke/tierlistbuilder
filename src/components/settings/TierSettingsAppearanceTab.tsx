// src/components/settings/TierSettingsAppearanceTab.tsx
// appearance tab content for theme, text style, & tier-color sync

import { useSettingsStore } from '../../store/useSettingsStore'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { TextStylePicker } from './TextStylePicker'
import { ThemePicker } from './ThemePicker'
import { Toggle } from './Toggle'

interface TierSettingsAppearanceTabProps
{
  onRequestSyncConfirm: () => void
}

export const TierSettingsAppearanceTab = ({
  onRequestSyncConfirm,
}: TierSettingsAppearanceTabProps) =>
{
  const syncTierColorsWithTheme = useSettingsStore(
    (state) => state.syncTierColorsWithTheme
  )
  const setSyncTierColorsWithTheme = useSettingsStore(
    (state) => state.setSyncTierColorsWithTheme
  )

  return (
    <>
      <SettingsSection title="Theme">
        <ThemePicker />
      </SettingsSection>

      <SettingsSection title="Text Style">
        <TextStylePicker />
      </SettingsSection>

      <SettingsSection title="Tier Colors">
        <SettingRow label="Sync Tier Colors">
          <Toggle
            checked={syncTierColorsWithTheme}
            onChange={(checked) =>
            {
              if (checked)
              {
                onRequestSyncConfirm()
                return
              }

              setSyncTierColorsWithTheme(false)
            }}
          />
        </SettingRow>
        <p className="mt-1 text-xs text-[var(--t-text-dim)]">
          Automatically updates tier colors when switching themes. Turn off to
          keep custom colors.
        </p>
      </SettingsSection>
    </>
  )
}
