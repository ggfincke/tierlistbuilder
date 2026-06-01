// src/features/social/settings/ui/AppearanceSection.tsx
// app-chrome appearance controls mirrored by the Preferences modal

import { useShallow } from 'zustand/react/shallow'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { PalettePicker } from '~/shared/ui/settings/PalettePicker'
import { TextStylePicker } from '~/shared/ui/settings/TextStylePicker'
import { ThemePicker } from '~/shared/ui/settings/ThemePicker'
import {
  SetSection,
  SettingLabel,
  ToggleRow,
} from '~/shared/ui/settings/SettingsChrome'

export const AppearanceSection = () =>
{
  const {
    themeId,
    setThemeId,
    paletteId,
    setPaletteId,
    textStyleId,
    setTextStyleId,
    reducedMotion,
    setReducedMotion,
    compactMode,
    setCompactMode,
    topNavLocked,
    setTopNavLocked,
  } = usePreferencesStore(
    useShallow((s) => ({
      themeId: s.themeId,
      setThemeId: s.setThemeId,
      paletteId: s.paletteId,
      setPaletteId: s.setPaletteId,
      textStyleId: s.textStyleId,
      setTextStyleId: s.setTextStyleId,
      reducedMotion: s.reducedMotion,
      setReducedMotion: s.setReducedMotion,
      compactMode: s.compactMode,
      setCompactMode: s.setCompactMode,
      topNavLocked: s.topNavLocked,
      setTopNavLocked: s.setTopNavLocked,
    }))
  )

  return (
    <SetSection
      eyebrow="Look & feel"
      title="Appearance"
      subtitle="App chrome only — boards can override individually."
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1.5fr_1fr]">
        <div>
          <SettingLabel>Theme</SettingLabel>
          <ThemePicker value={themeId} onChange={setThemeId} />
        </div>
        <div>
          <SettingLabel>Tier palette</SettingLabel>
          <PalettePicker value={paletteId} onChange={setPaletteId} />
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <SettingLabel>Text style</SettingLabel>
            <TextStylePicker value={textStyleId} onChange={setTextStyleId} />
          </div>
          <div className="flex flex-col gap-0.5">
            <ToggleRow
              label="Reduce motion"
              hint="Disables animations & transitions."
              checked={reducedMotion}
              onChange={setReducedMotion}
            />
            <ToggleRow
              label="Compact board layouts"
              hint="Tighter row heights."
              checked={compactMode}
              onChange={setCompactMode}
            />
            <ToggleRow
              label="Lock navigation bar"
              hint="Keep the top bar pinned instead of auto-hiding."
              checked={topNavLocked}
              onChange={setTopNavLocked}
            />
          </div>
        </div>
      </div>
    </SetSection>
  )
}
