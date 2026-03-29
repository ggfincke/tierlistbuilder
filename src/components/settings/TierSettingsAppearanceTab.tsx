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
          Palette indices stay assigned
        </span>
      </SettingRow>
      <p className="mt-1 text-xs text-[var(--t-text-dim)]">
        Palette-backed tiers keep the same picker position when the theme
        changes. Custom colors stay fixed until you change them yourself.
      </p>
    </SettingsSection>
  </>
)
