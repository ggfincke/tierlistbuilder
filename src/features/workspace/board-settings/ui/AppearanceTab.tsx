// src/features/workspace/board-settings/ui/AppearanceTab.tsx
// per-board style overrides for palette, text style, & page background

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useSwitchImageStyle } from '~/features/workspace/boards/model/useSwitchImageStyle'
import { useTemplateBySlug } from '~/features/marketplace/model/detail/useTemplateDetail'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { THEMES } from '~/shared/theme/tokens'
import { OverrideColorRow } from '~/shared/ui/settings/OverrideColorRow'
import { PalettePicker } from '~/shared/ui/settings/PalettePicker'
import { SettingRow } from '~/shared/ui/settings/SettingRow'
import { StylePicker } from '~/shared/ui/settings/StylePicker'
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

// a roving radiogroup selects on every arrow-key, but the switch is a heavyweight
// server op (re-points pooled images + re-materialize). debounce so arrowing
// through skins commits once the user settles, showing the choice optimistically
const STYLE_SWITCH_DEBOUNCE_MS = 350

// live skin switch for template-backed boards. unlike palette/text-style this
// isn't a local override -- it re-points pooled item images server-side, so it
// routes through the switch mutation & only works once the board has synced
const ImageStyleSection = () =>
{
  const { imageStyleId, sourceTemplateId, isSynced, hasPendingSync } =
    useActiveBoardStore(
      useShallow((state) => ({
        imageStyleId: state.imageStyleId,
        sourceTemplateId: state.sourceTemplateId,
        isSynced: Boolean(state.cloudBoardExternalId),
        hasPendingSync: state.pendingSyncAt !== null,
      }))
    )
  const detail = useTemplateBySlug(sourceTemplateId)
  const { run, isPending } = useSwitchImageStyle()
  // optimistic skin shown while the debounce settles & the switch runs
  const [pendingStyleId, setPendingStyleId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () =>
    {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  const styleOptions = detail?.styleOptions ?? []
  if (!sourceTemplateId || styleOptions.length <= 1) return null

  const defaultStyleExternalId =
    styleOptions.find((style) => style.isDefault)?.externalId ??
    styleOptions[0].externalId
  const activeStyleId = imageStyleId ?? defaultStyleExternalId
  const shownStyleId = pendingStyleId ?? activeStyleId
  // the switch is a server op that bumps the board revision, so it's only safe
  // once edits have flushed -- otherwise it conflicts w/ the pending push
  const caption = !isSynced
    ? 'Sync this board to the cloud to switch image styles.'
    : hasPendingSync
      ? 'Saving recent edits… you can switch the image style once they save.'
      : 'Switch the artwork skin for this board. Imported & recropped items keep their images.'

  const onSelect = (styleId: string) =>
  {
    // shownStyleId resolves null -> default externalId, so re-selecting the live
    // skin (incl. the default tile) short-circuits before any round-trip
    if (styleId === shownStyleId) return
    // single-threaded JS: this runs to completion before any pending timer can
    // fire, so clearing here always pre-empts the prior switch (no race)
    if (timerRef.current) clearTimeout(timerRef.current)
    setPendingStyleId(styleId)
    timerRef.current = setTimeout(() =>
    {
      void run(styleId).finally(() => setPendingStyleId(null))
    }, STYLE_SWITCH_DEBOUNCE_MS)
  }

  return (
    <SettingsSection title="Image Style">
      <p className="mb-3 mt-1 text-xs text-[var(--t-text-muted)]">{caption}</p>
      <StylePicker
        options={styleOptions}
        value={shownStyleId}
        onChange={onSelect}
        disabled={isPending || !isSynced || hasPendingSync}
      />
    </SettingsSection>
  )
}

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

      <ImageStyleSection />
    </>
  )
}
