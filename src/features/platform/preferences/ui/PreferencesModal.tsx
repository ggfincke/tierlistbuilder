// src/features/platform/preferences/ui/PreferencesModal.tsx
// user-level preferences modal for appearance & accessibility — account
// management lives in its own AccountModal opened from the avatar dropdown

import { useId, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { PalettePicker } from '~/shared/ui/settings/PalettePicker'
import { SettingRow } from '~/shared/ui/settings/SettingRow'
import { TextStylePicker } from '~/shared/ui/settings/TextStylePicker'
import { ThemePicker } from '~/shared/ui/settings/ThemePicker'
import { Toggle } from '~/shared/ui/settings/Toggle'
import { OverrideColorRow } from '~/shared/ui/settings/OverrideColorRow'
import {
  HIGH_CONTRAST_THEME_ID,
  usePreferencesStore,
} from '~/features/platform/preferences/model/usePreferencesStore'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { TabbedSettingsModal } from '~/shared/ui/TabbedSettingsModal'
import { THEMES } from '~/shared/theme/tokens'

const TABS = ['appearance', 'accessibility'] as const
export type PreferencesTab = (typeof TABS)[number]

interface PreferencesModalProps
{
  open: boolean
  onClose: () => void
  initialTab?: PreferencesTab
}

const AppearancePane = () =>
{
  const {
    themeId,
    setThemeId,
    paletteId,
    setPaletteId,
    textStyleId,
    setTextStyleId,
    boardBackgroundOverride,
    setBoardBackgroundOverride,
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
    }))
  )

  return (
    <>
      <SettingsSection title="App Theme">
        <ThemePicker value={themeId} onChange={setThemeId} />

        <OverrideColorRow
          label="Page Background"
          value={boardBackgroundOverride}
          defaultColor={THEMES[themeId]['bg-page']}
          onChange={setBoardBackgroundOverride}
          onReset={() => setBoardBackgroundOverride(null)}
          resetLabel="Reset page background to theme default"
          resetTitle="Reset to theme default"
        />
      </SettingsSection>

      <SettingsSection title="Default Tier Color Palette">
        <p className="mb-2 text-xs text-[var(--t-text-muted)]">
          Boards inherit this palette unless they override it in board settings.
        </p>
        <PalettePicker value={paletteId} onChange={setPaletteId} />
      </SettingsSection>

      <SettingsSection title="Default Text Style">
        <p className="mb-2 text-xs text-[var(--t-text-muted)]">
          Boards inherit this style unless they override it in board settings.
        </p>
        <TextStylePicker value={textStyleId} onChange={setTextStyleId} />
      </SettingsSection>
    </>
  )
}

const AccessibilityPane = () =>
{
  const {
    themeId,
    reducedMotion,
    setReducedMotion,
    toggleHighContrast,
    topNavLocked,
    setTopNavLocked,
  } = usePreferencesStore(
    useShallow((s) => ({
      themeId: s.themeId,
      reducedMotion: s.reducedMotion,
      setReducedMotion: s.setReducedMotion,
      toggleHighContrast: s.toggleHighContrast,
      topNavLocked: s.topNavLocked,
      setTopNavLocked: s.setTopNavLocked,
    }))
  )
  const highContrastDescriptionId = useId()
  const reduceMotionDescriptionId = useId()
  const topNavLockedDescriptionId = useId()
  // Volt is the Scoreboard system's high-contrast theme — see toggleHighContrast
  // in usePreferencesStore for the swap-&-restore logic.
  const isHighContrast = themeId === HIGH_CONTRAST_THEME_ID

  return (
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
        className="mb-3 mt-1 text-xs text-[var(--t-text-muted)]"
      >
        Disables animations & transitions. Also respects your OS setting.
      </p>

      <SettingRow label="Lock Navigation Bar">
        <Toggle
          checked={topNavLocked}
          onChange={setTopNavLocked}
          ariaDescribedby={topNavLockedDescriptionId}
        />
      </SettingRow>
      <p
        id={topNavLockedDescriptionId}
        className="mt-1 text-xs text-[var(--t-text-muted)]"
      >
        Keep the top navigation bar pinned instead of auto-hiding when idle.
      </p>
    </SettingsSection>
  )
}

export const PreferencesModal = ({
  open,
  onClose,
  initialTab = 'appearance',
}: PreferencesModalProps) =>
{
  const [activeTab, setActiveTab] = useState<PreferencesTab>(initialTab)

  return (
    <TabbedSettingsModal
      open={open}
      title="Preferences"
      tabs={TABS}
      activeTab={activeTab}
      groupLabel="Preferences sections"
      onActiveTabChange={setActiveTab}
      onClose={onClose}
    >
      {activeTab === 'appearance' && <AppearancePane />}
      {activeTab === 'accessibility' && <AccessibilityPane />}
    </TabbedSettingsModal>
  )
}
