// src/components/settings/TierSettingsAppearanceTab.tsx
// appearance tab content for app theme, tier color palette, & text style

import { PalettePicker } from './PalettePicker'
import { SettingsSection } from './SettingsSection'
import { TextStylePicker } from './TextStylePicker'
import { ThemePicker } from './ThemePicker'

export const TierSettingsAppearanceTab = () => (
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
  </>
)
