// src/features/platform/preferences/ui/PreferencesModal.tsx
// user-level preferences modal for appearance & accessibility — account
// management lives in its own AccountModal opened from the avatar dropdown

import { useId, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { PalettePicker } from '~/features/workspace/settings/ui/PalettePicker'
import { SettingRow } from '~/features/workspace/settings/ui/SettingRow'
import { TextStylePicker } from '~/features/workspace/settings/ui/TextStylePicker'
import { ThemePicker } from '~/features/workspace/settings/ui/ThemePicker'
import { Toggle } from '~/features/workspace/settings/ui/Toggle'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { ColorInput } from '~/shared/ui/ColorInput'
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
  } = useSettingsStore(
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
  const { themeId, reducedMotion, setReducedMotion, toggleHighContrast } =
    useSettingsStore(
      useShallow((s) => ({
        themeId: s.themeId,
        reducedMotion: s.reducedMotion,
        setReducedMotion: s.setReducedMotion,
        toggleHighContrast: s.toggleHighContrast,
      }))
    )
  const highContrastDescriptionId = useId()
  const reduceMotionDescriptionId = useId()
  const isHighContrast = themeId === 'high-contrast'

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
        className="mt-1 text-xs text-[var(--t-text-muted)]"
      >
        Disables animations & transitions. Also respects your OS setting.
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
