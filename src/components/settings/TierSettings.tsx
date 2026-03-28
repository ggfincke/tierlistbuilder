// src/components/settings/TierSettings.tsx
// settings panel — tabbed modal w/ items management & preferences

import { Github, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { getStorageUsageBytes } from '../../utils/storage'
import { buildRecolorMap, PALETTES, THEME_PALETTE } from '../../theme'
import { THEMES } from '../../theme/tokens'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '../../types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DeletedItemsSection } from './DeletedItemsSection'
import { ImageUploader } from './ImageUploader'
import { SegmentedControl } from './SegmentedControl'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { TextStylePicker } from './TextStylePicker'
import { ThemePicker } from './ThemePicker'
import { Toggle } from './Toggle'

type Tab = 'items' | 'appearance' | 'layout' | 'more'
const TABS: Tab[] = ['items', 'appearance', 'layout', 'more']

interface TierSettingsProps
{
  // controls panel visibility
  open: boolean
  // called when the user closes the panel
  onClose: () => void
}

// detect macOS for keyboard shortcut labels
const isMac = navigator.platform.startsWith('Mac')
const modKey = isMac ? 'Cmd' : 'Ctrl'

// keyboard shortcuts displayed in the preferences tab
const SHORTCUTS = [
  { keys: [modKey, 'Z'], description: 'Undo' },
  { keys: [modKey, 'Shift', 'Z'], description: 'Redo' },
  {
    keys: ['Esc'],
    description: 'Close modal / cancel edit / exit keyboard mode',
  },
  { keys: ['Enter'], description: 'Confirm edit / submit' },
  { keys: ['Space'], description: 'Enter keyboard mode / pick up / drop' },
  { keys: ['Arrow Keys'], description: 'Browse items / move dragged item' },
]

export const TierSettings = ({ open, onClose }: TierSettingsProps) =>
{
  const addTextItem = useTierListStore((state) => state.addTextItem)
  const clearAllItems = useTierListStore((state) => state.clearAllItems)

  const itemSize = useSettingsStore((state) => state.itemSize)
  const showLabels = useSettingsStore((state) => state.showLabels)
  const itemShape = useSettingsStore((state) => state.itemShape)
  const compactMode = useSettingsStore((state) => state.compactMode)
  const exportBackgroundOverride = useSettingsStore(
    (state) => state.exportBackgroundOverride
  )
  const themeId = useSettingsStore((state) => state.themeId)
  const effectiveExportBg =
    exportBackgroundOverride ?? THEMES[themeId]['export-bg']
  const defaultTextColor = useMemo(() =>
  {
    const palette = PALETTES[THEME_PALETTE[themeId]]
    return palette.defaults[1] ?? palette.defaults[0] ?? '#888888'
  }, [themeId])
  const labelWidth = useSettingsStore((state) => state.labelWidth)
  const hideRowControls = useSettingsStore((state) => state.hideRowControls)
  const confirmBeforeDelete = useSettingsStore(
    (state) => state.confirmBeforeDelete
  )
  const setItemSize = useSettingsStore((state) => state.setItemSize)
  const setShowLabels = useSettingsStore((state) => state.setShowLabels)
  const setItemShape = useSettingsStore((state) => state.setItemShape)
  const setCompactMode = useSettingsStore((state) => state.setCompactMode)
  const setExportBackgroundOverride = useSettingsStore(
    (state) => state.setExportBackgroundOverride
  )
  const setLabelWidth = useSettingsStore((state) => state.setLabelWidth)
  const setHideRowControls = useSettingsStore(
    (state) => state.setHideRowControls
  )
  const setConfirmBeforeDelete = useSettingsStore(
    (state) => state.setConfirmBeforeDelete
  )
  const syncTierColorsWithTheme = useSettingsStore(
    (state) => state.syncTierColorsWithTheme
  )
  const setSyncTierColorsWithTheme = useSettingsStore(
    (state) => state.setSyncTierColorsWithTheme
  )
  const batchRecolorTiers = useTierListStore((state) => state.batchRecolorTiers)
  const tiers = useTierListStore((state) => state.tiers)
  const tierLabelBold = useSettingsStore((state) => state.tierLabelBold)
  const tierLabelItalic = useSettingsStore((state) => state.tierLabelItalic)
  const tierLabelFontSize = useSettingsStore((state) => state.tierLabelFontSize)
  const setTierLabelBold = useSettingsStore((state) => state.setTierLabelBold)
  const setTierLabelItalic = useSettingsStore(
    (state) => state.setTierLabelItalic
  )
  const setTierLabelFontSize = useSettingsStore(
    (state) => state.setTierLabelFontSize
  )

  const boards = useBoardManagerStore((state) => state.boards)
  const createBoard = useBoardManagerStore((state) => state.createBoard)

  const [activeTab, setActiveTab] = useState<Tab>('items')
  const [textLabel, setTextLabel] = useState('')
  const [textColor, setTextColor] = useState(defaultTextColor)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const lastDefaultTextColorRef = useRef(defaultTextColor)

  // stable ref for onClose — avoids re-registering listener when parent passes unstable callback
  const onCloseRef = useRef(onClose)
  useEffect(() =>
  {
    onCloseRef.current = onClose
  })

  // keep the draft text-item color aligned to the active palette until the user customizes it
  useEffect(() =>
  {
    setTextColor((current) =>
      current === lastDefaultTextColorRef.current ? defaultTextColor : current
    )
    lastDefaultTextColorRef.current = defaultTextColor
  }, [defaultTextColor])

  // close on Escape
  useEffect(() =>
  {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) =>
    {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

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

  const storageMb = storageBytes / (1024 * 1024)
  const storageMaxMb = 5
  const storagePercent = Math.min((storageMb / storageMaxMb) * 100, 100)
  const storageColor =
    storagePercent > 85
      ? 'bg-[var(--t-destructive)]'
      : storagePercent > 60
        ? 'bg-[color-mix(in_srgb,var(--t-accent)_60%,var(--t-destructive))]'
        : 'bg-[var(--t-accent)]'

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
            <>
              <SettingsSection title="Import Images">
                <p className="-mt-1 mb-2 text-xs text-[var(--t-text-faint)]">
                  Drop files here or choose them from your computer.
                </p>
                <ImageUploader />
              </SettingsSection>

              {/* text-only item creation */}
              <SettingsSection title="Add Text Item">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={textLabel}
                    onChange={(e) => setTextLabel(e.target.value)}
                    onKeyDown={(e) =>
                    {
                      if (e.key === 'Enter')
                      {
                        handleAddTextItem()
                      }
                    }}
                    placeholder="Label"
                    className="min-w-0 flex-1 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] outline-none focus:border-[var(--t-border-hover)]"
                  />
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent"
                  />
                  <button
                    type="button"
                    disabled={!textLabel.trim()}
                    onClick={handleAddTextItem}
                    className="rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--t-text)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Add
                  </button>
                </div>
              </SettingsSection>

              <DeletedItemsSection />
            </>
          )}

          {activeTab === 'appearance' && (
            <>
              <SettingsSection title="Theme">
                <ThemePicker />
              </SettingsSection>

              <SettingsSection title="Text Style">
                <TextStylePicker />
              </SettingsSection>

              <SettingsSection title="Tier Colors">
                <SettingRow label="Sync Tier Colors">
                  <Toggle
                    checked={syncTierColorsWithTheme}
                    onChange={(checked) =>
                    {
                      if (checked) setShowSyncConfirm(true)
                      else setSyncTierColorsWithTheme(false)
                    }}
                  />
                </SettingRow>
                <p className="mt-1 text-xs text-[var(--t-text-dim)]">
                  Automatically updates tier colors when switching themes. Turn
                  off to keep custom colors.
                </p>
              </SettingsSection>
            </>
          )}

          {activeTab === 'layout' && (
            <>
              <SettingsSection title="Items">
                <SettingRow label="Item Size">
                  <SegmentedControl<ItemSize>
                    options={[
                      { value: 'small', label: 'S' },
                      { value: 'medium', label: 'M' },
                      { value: 'large', label: 'L' },
                    ]}
                    value={itemSize}
                    onChange={setItemSize}
                  />
                </SettingRow>
                <SettingRow label="Item Shape">
                  <SegmentedControl<ItemShape>
                    options={[
                      { value: 'square', label: 'Square' },
                      { value: 'rounded', label: 'Rounded' },
                      { value: 'circle', label: 'Circle' },
                    ]}
                    value={itemShape}
                    onChange={setItemShape}
                  />
                </SettingRow>
                <SettingRow label="Show Labels">
                  <Toggle checked={showLabels} onChange={setShowLabels} />
                </SettingRow>
                <SettingRow label="Compact Mode">
                  <Toggle checked={compactMode} onChange={setCompactMode} />
                </SettingRow>
              </SettingsSection>

              <SettingsSection title="Tier Labels">
                <SettingRow label="Label Width">
                  <SegmentedControl<LabelWidth>
                    options={[
                      { value: 'narrow', label: 'Narrow' },
                      { value: 'default', label: 'Default' },
                      { value: 'wide', label: 'Wide' },
                    ]}
                    value={labelWidth}
                    onChange={setLabelWidth}
                  />
                </SettingRow>
                <SettingRow label="Font Size">
                  <SegmentedControl<TierLabelFontSize>
                    options={[
                      { value: 'xs', label: 'XS' },
                      { value: 'small', label: 'S' },
                      { value: 'medium', label: 'M' },
                      { value: 'large', label: 'L' },
                      { value: 'xl', label: 'XL' },
                    ]}
                    value={tierLabelFontSize}
                    onChange={setTierLabelFontSize}
                  />
                </SettingRow>
                <SettingRow label="Bold">
                  <Toggle checked={tierLabelBold} onChange={setTierLabelBold} />
                </SettingRow>
                <SettingRow label="Italic">
                  <Toggle
                    checked={tierLabelItalic}
                    onChange={setTierLabelItalic}
                  />
                </SettingRow>
                <SettingRow label="Hide Row Controls">
                  <Toggle
                    checked={hideRowControls}
                    onChange={setHideRowControls}
                  />
                </SettingRow>
              </SettingsSection>
            </>
          )}

          {activeTab === 'more' && (
            <>
              <SettingsSection title="Export">
                <SettingRow label="Background Color">
                  <div className="flex items-center gap-2">
                    {exportBackgroundOverride !== null && (
                      <button
                        type="button"
                        onClick={() => setExportBackgroundOverride(null)}
                        className="rounded p-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                        title="Reset to theme default"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <input
                      type="color"
                      value={effectiveExportBg}
                      onChange={(e) =>
                        setExportBackgroundOverride(e.target.value)
                      }
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent"
                    />
                  </div>
                </SettingRow>
              </SettingsSection>

              <SettingsSection title="Data & Lists">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-[var(--t-text-faint)]">
                    <Layers className="h-3.5 w-3.5" />
                    {boards.length} {boards.length === 1 ? 'list' : 'lists'}{' '}
                    saved
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                    {
                      createBoard()
                      onClose()
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-sm text-[var(--t-text)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New List
                  </button>
                </div>
                <p className="mt-2 text-xs text-[var(--t-text-dim)]">
                  Switch between lists using the button in the bottom-right
                  corner.
                </p>

                <div className="my-2 border-t border-[var(--t-border)]" />

                <SettingRow label="Confirm Before Delete">
                  <Toggle
                    checked={confirmBeforeDelete}
                    onChange={setConfirmBeforeDelete}
                  />
                </SettingRow>

                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(true)}
                  className="mt-1 flex items-center gap-1.5 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-sm text-[var(--t-destructive-hover)] hover:border-[color-mix(in_srgb,var(--t-destructive)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All Items
                </button>

                <div className="mt-3 pt-3 border-t border-[var(--t-border)]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-[var(--t-text-faint)]">
                      Storage
                    </span>
                    <span className="text-xs text-[var(--t-text-faint)]">
                      {storageMb.toFixed(1)} MB / {storageMaxMb} MB
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--t-bg-active)]">
                    <div
                      className={`h-full rounded-full transition-all ${storageColor}`}
                      style={{ width: `${storagePercent}%` }}
                    />
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection title="Keyboard Shortcuts">
                <div className="space-y-2">
                  {SHORTCUTS.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-[var(--t-text-secondary)]">
                        {shortcut.description}
                      </span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={key}
                            className="rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--t-text)]"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SettingsSection>

              <section className="flex items-center justify-between px-1 py-2">
                <span className="text-xs text-[var(--t-text-dim)]">
                  v{__APP_VERSION__}
                </span>
                <a
                  href="https://github.com/ggfincke/tierlistbuilder"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--t-text-faint)] transition-colors hover:text-[var(--t-text-muted)]"
                >
                  <Github size={14} />
                </a>
              </section>
            </>
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
