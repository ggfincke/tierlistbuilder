// src/components/settings/TierSettings.tsx
// settings panel — tabbed modal that orchestrates per-tab settings content

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { getPaletteColors } from '../../domain/tierColors'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useModalBackgroundInert } from '../../hooks/useModalBackgroundInert'
import { useTierListStore } from '../../store/useTierListStore'
import {
  resolveNextSelectionIndex,
  type SelectionNavigationKey,
} from '../../utils/selectionNavigation'
import { getStorageUsageBytes } from '../../utils/storage'
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
  const paletteId = useCurrentPaletteId()
  const defaultTextColor = useMemo(() =>
  {
    const colors = getPaletteColors(paletteId)
    return colors[1] ?? colors[0] ?? '#888888'
  }, [paletteId])

  const [activeTab, setActiveTab] = useState<Tab>('items')
  const [textLabel, setTextLabel] = useState('')
  const [textColor, setTextColor] = useState(defaultTextColor)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
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

  useDismissibleLayer({
    open,
    onDismiss: onClose,
    closeOnInteractOutside: false,
  })

  useFocusTrap(dialogRef, open)
  useModalBackgroundInert(open)

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

  return createPortal(
    <>
      {/* backdrop — click to close */}
      <div
        className="fixed inset-0 z-40 bg-black/60 animate-[fadeIn_100ms_ease-out]"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-0 z-50 m-auto flex h-[min(36rem,calc(100vh-4rem))] w-full max-w-2xl flex-col rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] p-4 shadow-2xl animate-[scaleIn_150ms_ease-out]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2
              id={titleId}
              className="text-lg font-semibold text-[var(--t-text)]"
            >
              Settings
            </h2>
            {/* tab buttons */}
            <div
              role="tablist"
              aria-label="Settings sections"
              className="flex gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5"
            >
              {TABS.map((tab, index) => (
                <button
                  key={tab}
                  ref={(node) =>
                  {
                    tabRefs.current[tab] = node
                  }}
                  type="button"
                  id={`${tabsId}-${tab}-tab`}
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`${tabsId}-${tab}-panel`}
                  tabIndex={activeTab === tab ? 0 : -1}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(event) =>
                  {
                    const key = event.key as SelectionNavigationKey

                    if (
                      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)
                    )
                    {
                      return
                    }

                    const nextIndex = resolveNextSelectionIndex({
                      currentIndex: index,
                      itemCount: TABS.length,
                      key,
                      columns: TABS.length,
                    })

                    if (nextIndex === null)
                    {
                      return
                    }

                    event.preventDefault()

                    const nextTab = TABS[nextIndex]
                    setActiveTab(nextTab)
                    tabRefs.current[nextTab]?.focus()
                  }}
                  className={`focus-custom rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] max-sm:px-2 max-sm:py-2 ${
                    activeTab === tab
                      ? 'bg-[var(--t-bg-active)] text-[var(--t-text)] shadow-sm'
                      : 'text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
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

        <div
          id={`${tabsId}-${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${activeTab}-tab`}
          className="min-h-0 space-y-5 overflow-y-auto pr-1"
        >
          {activeTab === 'items' && (
            <TierSettingsItemsTab
              textLabel={textLabel}
              textColor={textColor}
              onTextLabelChange={setTextLabel}
              onTextColorChange={setTextColor}
              onAddTextItem={handleAddTextItem}
            />
          )}

          {activeTab === 'appearance' && <TierSettingsAppearanceTab />}

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
    </>,
    document.body
  )
}
