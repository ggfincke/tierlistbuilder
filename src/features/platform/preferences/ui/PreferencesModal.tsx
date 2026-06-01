// src/features/platform/preferences/ui/PreferencesModal.tsx
// quick appearance & accessibility prefs popover; mirrored on /settings

import { useId } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import {
  HIGH_CONTRAST_THEME_ID,
  usePreferencesStore,
} from '~/features/platform/preferences/model/usePreferencesStore'
import { settingsTabPath } from '~/shared/routes/settings'
import { THEMES } from '~/shared/theme/tokens'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { OverrideColorRow } from '~/shared/ui/settings/OverrideColorRow'
import { PalettePicker } from '~/shared/ui/settings/PalettePicker'
import { SettingLabel, ToggleRow } from '~/shared/ui/settings/SettingsChrome'
import { TextStylePicker } from '~/shared/ui/settings/TextStylePicker'
import { ThemePicker } from '~/shared/ui/settings/ThemePicker'

interface PreferencesModalProps
{
  open: boolean
  onClose: () => void
}

export const PreferencesModal = ({ open, onClose }: PreferencesModalProps) =>
{
  const titleId = useId()
  const {
    themeId,
    setThemeId,
    paletteId,
    setPaletteId,
    textStyleId,
    setTextStyleId,
    boardBackgroundOverride,
    setBoardBackgroundOverride,
    reducedMotion,
    setReducedMotion,
    compactMode,
    setCompactMode,
    topNavLocked,
    setTopNavLocked,
    toggleHighContrast,
  } = usePreferencesStore(
    useShallow((s) => ({
      themeId: s.themeId,
      setThemeId: s.setThemeId,
      paletteId: s.paletteId,
      setPaletteId: s.setPaletteId,
      textStyleId: s.textStyleId,
      setTextStyleId: s.setTextStyleId,
      boardBackgroundOverride: s.boardBackgroundOverride,
      setBoardBackgroundOverride: s.setBoardBackgroundOverride,
      reducedMotion: s.reducedMotion,
      setReducedMotion: s.setReducedMotion,
      compactMode: s.compactMode,
      setCompactMode: s.setCompactMode,
      topNavLocked: s.topNavLocked,
      setTopNavLocked: s.setTopNavLocked,
      toggleHighContrast: s.toggleHighContrast,
    }))
  )

  // Volt doubles as the high-contrast theme; see toggleHighContrast.
  const isHighContrast = themeId === HIGH_CONTRAST_THEME_ID

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex w-full max-w-[860px] flex-col p-0"
    >
      <header className="flex items-center justify-between gap-4 border-b border-[var(--t-border)] px-6 pb-4 pt-5">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-text-faint)]">
            Quick prefs · this device
          </p>
          <h2
            id={titleId}
            className="mt-0.5 text-[22px] font-black leading-none text-[var(--t-text)]"
          >
            <span className="display-accent display-accent-shadow display-accent--full">
              Preferences
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={settingsTabPath('appearance')}
            onClick={onClose}
            className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-muted)] hover:underline"
          >
            All settings →
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preferences"
            className="focus-custom grid h-8 w-8 place-items-center rounded-full border border-[var(--t-border)] text-[var(--t-text-muted)] hover:bg-[var(--t-bg-hover)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-6 py-5">
        <div>
          <SettingLabel>Theme</SettingLabel>
          <ThemePicker value={themeId} onChange={setThemeId} />
        </div>

        <OverrideColorRow
          label="Page background"
          value={boardBackgroundOverride}
          defaultColor={THEMES[themeId]['bg-page']}
          onChange={setBoardBackgroundOverride}
          onReset={() => setBoardBackgroundOverride(null)}
          resetLabel="Reset page background to theme default"
          resetTitle="Reset to theme default"
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1.6fr_1fr]">
          <div>
            <SettingLabel>Tier palette</SettingLabel>
            <PalettePicker value={paletteId} onChange={setPaletteId} />
          </div>
          <div>
            <SettingLabel>Text style</SettingLabel>
            <TextStylePicker value={textStyleId} onChange={setTextStyleId} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-3 sm:grid-cols-2">
          <ToggleRow
            label="Reduce motion"
            hint="Disable animations & transitions"
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
          <ToggleRow
            label="Compact board layouts"
            hint="Tighter row heights"
            checked={compactMode}
            onChange={setCompactMode}
          />
          <ToggleRow
            label="High contrast"
            hint="Stronger borders & maximum text contrast"
            checked={isHighContrast}
            onChange={toggleHighContrast}
          />
          <ToggleRow
            label="Lock navigation bar"
            hint="Keep the top bar pinned instead of auto-hiding"
            checked={topNavLocked}
            onChange={setTopNavLocked}
          />
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-6 py-3.5">
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
          Saved on this device · ⌘, to reopen
        </span>
        <SecondaryButton onClick={onClose}>Done</SecondaryButton>
      </footer>
    </BaseModal>
  )
}
