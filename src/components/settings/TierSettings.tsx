// src/components/settings/TierSettings.tsx
// settings panel — tabbed modal that orchestrates per-tab settings content

import { useEffect, useMemo, useRef, useState } from 'react'

import { useTierListStore } from '../../store/useTierListStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { getStorageUsageBytes } from '../../utils/storage'
import { buildRecolorMap, PALETTES, THEME_PALETTE } from '../../theme'
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { TierSettingsAppearanceTab } from './TierSettingsAppearanceTab'
import { TierSettingsItemsTab } from './TierSettingsItemsTab'
import { TierSettingsLayoutTab } from './TierSettingsLayoutTab'
import { TierSettingsMoreTab } from './TierSettingsMoreTab'

type Tab = 'items' | 'appearance' | 'layout' | 'more'
const TABS: Tab[] = ['items', 'appearance', 'layout', 'more']

interface TierSettingsProps
{
  // controls panel visibility
  open: boolean
  // called when the user closes the panel
  onClose: () => void
}

export const TierSettings = ({ open, onClose }: TierSettingsProps) =>
{
  const addTextItem = useTierListStore((state) => state.addTextItem)
  const clearAllItems = useTierListStore((state) => state.clearAllItems)
  const themeId = useSettingsStore((state) => state.themeId)
  const defaultTextColor = useMemo(() =>
  {
    const palette = PALETTES[THEME_PALETTE[themeId]]
    return palette.defaults[1] ?? palette.defaults[0] ?? '#888888'
  }, [themeId])
  const setSyncTierColorsWithTheme = useSettingsStore(
    (state) => state.setSyncTierColorsWithTheme
  )
  const batchRecolorTiers = useTierListStore((state) => state.batchRecolorTiers)
  const tiers = useTierListStore((state) => state.tiers)

  const [activeTab, setActiveTab] = useState<Tab>('items')
  const [textLabel, setTextLabel] = useState('')
  const [textColor, setTextColor] = useState(defaultTextColor)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const lastDefaultTextColorRef = useRef(defaultTextColor)

  // keep the draft text-item color aligned to the active palette until the user customizes it
  useEffect(() =>
  {
    setTextColor((current) =>
      current === lastDefaultTextColorRef.current ? defaultTextColor : current
    )
    lastDefaultTextColorRef.current = defaultTextColor
  }, [defaultTextColor])

  useDismissibleLayer({
    open,
    onDismiss: onClose,
    closeOnInteractOutside: false,
  })

  // compute storage usage when preferences tab opens
  const storageBytes = useMemo(
    () => (open && activeTab === 'more' ? getStorageUsageBytes() : 0),
    [open, activeTab]
  )

  // render nothing when closed to avoid mounting the uploader unnecessarily
  if (!open)
  {
    return null
  }

  const handleAddTextItem = () =>
  {
    const trimmed = textLabel.trim()
    if (!trimmed)
    {
      return
    }
    addTextItem(trimmed, textColor)
    setTextLabel('')
  }

  return (
    <>
      {/* backdrop — click to close */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      <div className="fixed inset-0 z-50 m-auto flex h-[min(36rem,calc(100vh-4rem))] w-full max-w-2xl flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-[var(--t-text)]">
              Settings
            </h2>
            {/* tab buttons */}
            <div className="flex gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? 'bg-[var(--t-bg-active)] text-[var(--t-text)] shadow-sm'
                      : 'text-[var(--t-text-faint)] hover:text-[var(--t-text-secondary)]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--t-border-secondary)] px-3 py-1 text-sm text-[var(--t-text-secondary)] hover:border-[var(--t-border-hover)]"
          >
            Done
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          {activeTab === 'items' && (
            <TierSettingsItemsTab
              textLabel={textLabel}
              textColor={textColor}
              onTextLabelChange={setTextLabel}
              onTextColorChange={setTextColor}
              onAddTextItem={handleAddTextItem}
            />
          )}

          {activeTab === 'appearance' && (
            <TierSettingsAppearanceTab
              onRequestSyncConfirm={() => setShowSyncConfirm(true)}
            />
          )}

          {activeTab === 'layout' && <TierSettingsLayoutTab />}

          {activeTab === 'more' && (
            <TierSettingsMoreTab
              storageBytes={storageBytes}
              onClose={onClose}
              onRequestClearAll={() => setShowClearAllConfirm(true)}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showClearAllConfirm}
        title="Clear all items?"
        description="All items will be removed from tiers & the unranked pool. They can be restored from Recently Deleted."
        confirmText="Clear all"
        onConfirm={() =>
        {
          clearAllItems()
          setShowClearAllConfirm(false)
        }}
        onCancel={() => setShowClearAllConfirm(false)}
      />

      <ConfirmDialog
        open={showSyncConfirm}
        title="Sync tier colors?"
        description="Tier colors that came from a palette will be updated to match the current theme. Custom colors will stay untouched."
        confirmText="Sync"
        variant="accent"
        onConfirm={() =>
        {
          setSyncTierColorsWithTheme(true)
          const paletteId = THEME_PALETTE[themeId]
          const colorMap = buildRecolorMap(paletteId, paletteId, tiers)
          if (colorMap.size > 0) batchRecolorTiers(colorMap)
          setShowSyncConfirm(false)
        }}
        onCancel={() => setShowSyncConfirm(false)}
      />
    </>
  )
}
