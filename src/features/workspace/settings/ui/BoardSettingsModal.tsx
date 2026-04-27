// src/features/workspace/settings/ui/BoardSettingsModal.tsx
// settings panel — tabbed modal that orchestrates per-tab settings content

import { ConfirmDialog } from '~/shared/overlay/ConfirmDialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FALLBACK_COLOR, getPaletteColors } from '~/shared/theme/tierColors'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { getStorageUsageBytes } from '~/shared/lib/storageMetering'
import { TabbedSettingsModal } from '~/shared/ui/TabbedSettingsModal'
import { AppearanceTab } from './AppearanceTab'
import { ItemsTab } from './ItemsTab'
import { LayoutTab } from './LayoutTab'
import { MoreTab } from './MoreTab'

const TABS = ['items', 'appearance', 'layout', 'more'] as const
export type SettingsTab = (typeof TABS)[number]

interface BoardSettingsModalProps
{
  open: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

export const BoardSettingsModal = ({
  open,
  onClose,
  initialTab = 'items',
}: BoardSettingsModalProps) =>
{
  const addTextItem = useActiveBoardStore((state) => state.addTextItem)
  const clearAllItems = useActiveBoardStore((state) => state.clearAllItems)
  const paletteId = useCurrentPaletteId()
  const defaultTextColor = useMemo(() =>
  {
    const colors = getPaletteColors(paletteId)
    return colors[1] ?? colors[0] ?? FALLBACK_COLOR
  }, [paletteId])

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [textLabel, setTextLabel] = useState('')
  const [textColor, setTextColor] = useState(defaultTextColor)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)
  const lastDefaultTextColorRef = useRef(defaultTextColor)

  // keep the draft text-item color aligned to the active palette until the user customizes it
  useEffect(() =>
  {
    setTextColor((current) =>
      current === lastDefaultTextColorRef.current ? defaultTextColor : current
    )
    lastDefaultTextColorRef.current = defaultTextColor
  }, [defaultTextColor])

  const handleClose = useCallback(() =>
  {
    setShowClearAllConfirm(false)
    onClose()
  }, [onClose])

  // compute storage usage when the More tab is visible — useMemo derives it
  // synchronously without an effect & re-computes only when [open, activeTab]
  // change, so re-renders inside the More tab don't re-scan localStorage
  const storageBytes = useMemo(
    () => (open && activeTab === 'more' ? getStorageUsageBytes() : 0),
    [open, activeTab]
  )

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
      <TabbedSettingsModal
        open={open}
        title="Settings"
        tabs={TABS}
        activeTab={activeTab}
        groupLabel="Settings sections"
        onActiveTabChange={setActiveTab}
        onClose={handleClose}
      >
        {activeTab === 'items' && (
          <ItemsTab
            textLabel={textLabel}
            textColor={textColor}
            onTextLabelChange={setTextLabel}
            onTextColorChange={setTextColor}
            onAddTextItem={handleAddTextItem}
          />
        )}

        {activeTab === 'appearance' && <AppearanceTab />}

        {activeTab === 'layout' && <LayoutTab />}

        {activeTab === 'more' && (
          <MoreTab
            storageBytes={storageBytes}
            onClose={handleClose}
            onRequestClearAll={() => setShowClearAllConfirm(true)}
          />
        )}
      </TabbedSettingsModal>

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
    </>
  )
}
