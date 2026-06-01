// src/features/workspace/board-settings/ui/AppearanceTab.tsx
// per-board style overrides for palette, text style, & page background

import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { THEMES } from '~/shared/theme/tokens'
import { OverrideColorRow } from '~/shared/ui/settings/OverrideColorRow'
import { PalettePicker } from '~/shared/ui/settings/PalettePicker'
import { SettingRow } from '~/shared/ui/settings/SettingRow'
import { TextStylePicker } from '~/shared/ui/settings/TextStylePicker'
import { Toggle } from '~/shared/ui/settings/Toggle'

interface OverrideSectionProps
{
  title: string
  usesDefault: boolean
  onDefaultChange: (checked: boolean) => void
  caption: string
  children: ReactNode
}

const OverrideSection = ({
  title,
  usesDefault,
  onDefaultChange,
  caption,
  children,
}: OverrideSectionProps) => (
  <SettingsSection title={title}>
    <SettingRow label="Use my default">
      <Toggle checked={usesDefault} onChange={onDefaultChange} />
    </SettingRow>
    <p className="mb-3 mt-1 text-xs text-[var(--t-text-muted)]">{caption}</p>
    {children}
  </SettingsSection>
)

export const AppearanceTab = () =>
{
  const userPaletteId = usePreferencesStore((s) => s.paletteId)
  const userTextStyleId = usePreferencesStore((s) => s.textStyleId)
  const userBgOverride = usePreferencesStore((s) => s.boardBackgroundOverride)
  const themeId = usePreferencesStore((s) => s.themeId)

  const {
    paletteOverride,
    textStyleOverride,
    pageBackgroundOverride,
    setBoardPaletteOverride,
    setBoardTextStyleOverride,
    setBoardPageBackground,
  } = useActiveBoardStore(
    useShallow((state) => ({
      paletteOverride: state.paletteId,
      textStyleOverride: state.textStyleId,
      pageBackgroundOverride: state.pageBackground,
      setBoardPaletteOverride: state.setBoardPaletteOverride,
      setBoardTextStyleOverride: state.setBoardTextStyleOverride,
      setBoardPageBackground: state.setBoardPageBackground,
    }))
  )

  const paletteUsesDefault = paletteOverride === undefined
  const textStyleUsesDefault = textStyleOverride === undefined
  const pageBgUsesDefault = pageBackgroundOverride === undefined

  const resolvedBgValue =
    pageBackgroundOverride ?? userBgOverride ?? THEMES[themeId]['bg-page']

  return (
    <>
      <OverrideSection
        title="Tier Color Palette"
        usesDefault={paletteUsesDefault}
        onDefaultChange={(checked) =>
          setBoardPaletteOverride(checked ? null : userPaletteId)
        }
        caption="Off pins this board to a specific palette. Change your default in Preferences."
      >
        <PalettePicker
          value={paletteOverride ?? userPaletteId}
          onChange={setBoardPaletteOverride}
          disabled={paletteUsesDefault}
        />
      </OverrideSection>

      <OverrideSection
        title="Text Style"
        usesDefault={textStyleUsesDefault}
        onDefaultChange={(checked) =>
          setBoardTextStyleOverride(checked ? null : userTextStyleId)
        }
        caption="Off pins this board to a specific text style."
      >
        <TextStylePicker
          value={textStyleOverride ?? userTextStyleId}
          onChange={setBoardTextStyleOverride}
          disabled={textStyleUsesDefault}
        />
      </OverrideSection>

      <OverrideSection
        title="Page Background"
        usesDefault={pageBgUsesDefault}
        onDefaultChange={(checked) =>
          setBoardPageBackground(checked ? null : resolvedBgValue)
        }
        caption="Off uses a custom color for this board only."
      >
        <OverrideColorRow
          label="Color"
          value={pageBackgroundOverride}
          defaultColor={resolvedBgValue}
          onChange={setBoardPageBackground}
          onReset={() => setBoardPageBackground(null)}
          resetLabel="Reset page background to my default"
          resetTitle="Reset to my default"
          disabled={pageBgUsesDefault}
        />
      </OverrideSection>
    </>
  )
}
