// src/components/settings/TierSettingsAppearanceTab.tsx
// appearance tab content for theme, text style, & canonical tier-color behavior

import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { TextStylePicker } from './TextStylePicker'
import { ThemePicker } from './ThemePicker'

export const TierSettingsAppearanceTab = () => (
  <>
    <SettingsSection title="Theme">
      <ThemePicker />
    </SettingsSection>

    <SettingsSection title="Text Style">
      <TextStylePicker />
    </SettingsSection>

    <SettingsSection title="Tier Colors">
      <SettingRow label="Theme Behavior">
        <span className="text-sm text-[var(--t-text-secondary)]">
          Palette colors follow theme
        </span>
      </SettingRow>
      <p className="mt-1 text-xs text-[var(--t-text-dim)]">
        Palette colors always follow the active theme. Custom colors stay fixed
        until you choose a palette color again.
      </p>
    </SettingsSection>
  </>
)
