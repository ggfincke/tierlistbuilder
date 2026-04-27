// src/features/workspace/settings/ui/AppearanceTab.tsx
// per-board style overrides for palette, text style, & page background

import { RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { ColorInput } from '~/shared/ui/ColorInput'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { THEMES } from '~/shared/theme/tokens'
import { PalettePicker } from './PalettePicker'
import { SettingRow } from './SettingRow'
import { TextStylePicker } from './TextStylePicker'
import { Toggle } from './Toggle'

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
  const userPaletteId = useSettingsStore((s) => s.paletteId)
  const userTextStyleId = useSettingsStore((s) => s.textStyleId)
  const userBgOverride = useSettingsStore((s) => s.boardBackgroundOverride)
  const themeId = useSettingsStore((s) => s.themeId)

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
        <SettingRow label="Color">
          {(labelId) => (
            <div className="flex items-center gap-2">
              {!pageBgUsesDefault && pageBackgroundOverride !== undefined && (
                <button
                  type="button"
                  onClick={() => setBoardPageBackground(null)}
                  aria-label="Reset page background to my default"
                  className="rounded p-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-50"
                  title="Reset to my default"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <ColorInput
                value={resolvedBgValue}
                onChange={(e) => setBoardPageBackground(e.target.value)}
                disabled={pageBgUsesDefault}
                aria-labelledby={labelId}
              />
            </div>
          )}
        </SettingRow>
      </OverrideSection>
    </>
  )
}
