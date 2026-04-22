// src/features/workspace/settings/ui/BoardSettingsModal.tsx
// settings panel — tabbed modal that orchestrates per-tab settings content

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { FALLBACK_COLOR, getPaletteColors } from '@/shared/theme/tierColors'
import { useCurrentPaletteId } from '@/features/workspace/settings/model/useCurrentPaletteId'
import { useRovingSelection } from '@/shared/selection/useRovingSelection'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { getStorageUsageBytes } from '@/shared/lib/storageMetering'
import { BaseModal } from '@/shared/overlay/BaseModal'
import { ConfirmDialog } from '@/shared/overlay/ConfirmDialog'
import { SecondaryButton } from '@/shared/ui/SecondaryButton'
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
  const titleId = useId()
  const tabsId = useId()

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

  const {
    getItemProps: getTabProps,
    groupProps: tabListProps,
    isActive,
  } = useRovingSelection({
    items: TABS,
    activeKey: activeTab,
    onSelect: setActiveTab,
    kind: 'tab',
    groupLabel: 'Settings sections',
  })

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
      <BaseModal
        open={open}
        onClose={handleClose}
        labelledBy={titleId}
        panelClassName="flex h-[min(36rem,calc(100vh-4rem))] w-full max-w-2xl flex-col p-4"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2
              id={titleId}
              className="text-lg font-semibold text-[var(--t-text)]"
            >
              Settings
            </h2>
            <div
              {...tabListProps}
              className="flex gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5"
            >
              {TABS.map((tab, index) => (
                <button
                  key={tab}
                  {...getTabProps(tab, index)}
                  id={`${tabsId}-${tab}-tab`}
                  aria-controls={`${tabsId}-${tab}-panel`}
                  className={`focus-custom rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] max-sm:px-2 max-sm:py-2 ${
                    isActive(tab)
                      ? 'bg-[var(--t-bg-active)] text-[var(--t-text)] shadow-sm'
                      : 'text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <SecondaryButton size="sm" onClick={handleClose}>
            Done
          </SecondaryButton>
        </div>

        <div
          id={`${tabsId}-${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${activeTab}-tab`}
          className="min-h-0 space-y-5 overflow-y-auto pr-1"
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
        </div>
      </BaseModal>

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
