// src/components/settings/TierSettings.tsx
// settings panel — tabbed modal w/ items management & preferences

import { Layers, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { getTextColor } from '../../utils/color'
import { getStorageUsageBytes } from '../../utils/constants'
import type { ItemShape, ItemSize, LabelWidth } from '../../types'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { ImageUploader } from './ImageUploader'

type Tab = 'items' | 'preferences'

interface TierSettingsProps
{
  // controls panel visibility
  open: boolean
  // called when the user closes the panel
  onClose: () => void
}

// reusable toggle switch
const Toggle = ({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
      checked ? 'bg-sky-500' : 'bg-[#555]'
    }`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
      }`}
    />
  </button>
)

// reusable setting row w/ label on left, control on right
const SettingRow = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="text-sm text-[#ccc]">{label}</span>
    {children}
  </div>
)

// reusable segmented control
const SegmentedControl = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) => (
  <div className="flex rounded-lg border border-[#555] bg-[#2b2b2b]">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1 text-xs font-medium transition-colors ${
          value === opt.value
            ? 'bg-[#444] text-slate-100'
            : 'text-[#999] hover:text-[#ccc]'
        } ${opt.value === options[0].value ? 'rounded-l-[7px]' : ''} ${
          opt.value === options[options.length - 1].value
            ? 'rounded-r-[7px]'
            : ''
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
)

export const TierSettings = ({ open, onClose }: TierSettingsProps) =>
{
  const addTextItem = useTierListStore((state) => state.addTextItem)
  const deletedItems = useTierListStore((state) => state.deletedItems)
  const restoreDeletedItem = useTierListStore(
    (state) => state.restoreDeletedItem
  )
  const permanentlyDeleteItem = useTierListStore(
    (state) => state.permanentlyDeleteItem
  )
  const clearDeletedItems = useTierListStore((state) => state.clearDeletedItems)
  const clearAllItems = useTierListStore((state) => state.clearAllItems)

  const itemSize = useSettingsStore((state) => state.itemSize)
  const showLabels = useSettingsStore((state) => state.showLabels)
  const itemShape = useSettingsStore((state) => state.itemShape)
  const compactMode = useSettingsStore((state) => state.compactMode)
  const exportBackgroundColor = useSettingsStore(
    (state) => state.exportBackgroundColor
  )
  const labelWidth = useSettingsStore((state) => state.labelWidth)
  const hideRowControls = useSettingsStore((state) => state.hideRowControls)
  const confirmBeforeDelete = useSettingsStore(
    (state) => state.confirmBeforeDelete
  )
  const setItemSize = useSettingsStore((state) => state.setItemSize)
  const setShowLabels = useSettingsStore((state) => state.setShowLabels)
  const setItemShape = useSettingsStore((state) => state.setItemShape)
  const setCompactMode = useSettingsStore((state) => state.setCompactMode)
  const setExportBackgroundColor = useSettingsStore(
    (state) => state.setExportBackgroundColor
  )
  const setLabelWidth = useSettingsStore((state) => state.setLabelWidth)
  const setHideRowControls = useSettingsStore(
    (state) => state.setHideRowControls
  )
  const setConfirmBeforeDelete = useSettingsStore(
    (state) => state.setConfirmBeforeDelete
  )

  const boards = useBoardManagerStore((state) => state.boards)
  const createBoard = useBoardManagerStore((state) => state.createBoard)

  const [activeTab, setActiveTab] = useState<Tab>('items')
  const [textLabel, setTextLabel] = useState('')
  const [textColor, setTextColor] = useState('#ffbf7f')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false)

  // stable ref for onClose — avoids re-registering listener when parent passes unstable callback
  const onCloseRef = useRef(onClose)
  useEffect(() =>
  {
    onCloseRef.current = onClose
  })

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
    () => (open && activeTab === 'preferences' ? getStorageUsageBytes() : 0),
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
      ? 'bg-rose-500'
      : storagePercent > 60
        ? 'bg-yellow-500'
        : 'bg-green-500'

  return (
    <>
      {/* backdrop — click to close */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      <div
        className="fixed inset-0 z-50 m-auto flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col rounded-xl border border-[#444] bg-[#1e1e1e] p-4 shadow-2xl"
        style={{ height: 'fit-content' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-slate-100">
              Tier Settings
            </h2>
            {/* tab buttons */}
            <div className="flex gap-1 rounded-lg border border-[#444] bg-[#272727] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('items')}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  activeTab === 'items'
                    ? 'bg-[#3a3a3a] text-slate-100'
                    : 'text-[#999] hover:text-[#ccc]'
                }`}
              >
                Items
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  activeTab === 'preferences'
                    ? 'bg-[#3a3a3a] text-slate-100'
                    : 'text-[#999] hover:text-[#ccc]'
                }`}
              >
                Preferences
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#555] px-3 py-1 text-sm text-[#ddd] hover:border-[#777]"
          >
            Done
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {activeTab === 'items' ? (
            <>
              {/* image import section */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Import Images
                  </h3>
                  <p className="mt-1 text-xs text-[#999]">
                    Drop files here or choose them from your computer.
                  </p>
                </div>
                <ImageUploader />
              </section>

              {/* text-only item creation */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Add Text Item
                </h3>
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
                    className="min-w-0 flex-1 rounded-md border border-[#555] bg-[#2b2b2b] px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-[#888] outline-none focus:border-[#777]"
                  />
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[#555] bg-transparent"
                  />
                  <button
                    type="button"
                    disabled={!textLabel.trim()}
                    onClick={handleAddTextItem}
                    className="rounded-md border border-[#555] bg-[#2b2b2b] px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-[#777] hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Add
                  </button>
                </div>
              </section>

              {/* recently deleted items — only shown when there are deleted items */}
              {deletedItems.length > 0 && (
                <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Recently Deleted
                      <span className="ml-1.5 font-normal text-[#888]">
                        ({deletedItems.length})
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="flex items-center gap-1 text-xs text-[#888] hover:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {deletedItems.map((item) =>
                      {
                      const bgColor = item.backgroundColor ?? '#444'
                      return (
                        <div
                          key={item.id}
                          className="group relative h-16 w-16 shrink-0 overflow-hidden rounded opacity-70"
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.label ?? 'Deleted item'}
                              className="h-full w-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div
                              className="flex h-full w-full items-center justify-center p-0.5"
                              style={{
                                backgroundColor: bgColor,
                                color: getTextColor(bgColor),
                              }}
                            >
                              <span className="text-[10px] font-semibold break-words text-center leading-tight [overflow-wrap:anywhere]">
                                {item.label}
                              </span>
                            </div>
                          )}
                          {/* hover overlay — restore (bottom-left) & permanent delete (top-right) */}
                          <div className="absolute inset-0 flex items-end justify-start bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              aria-label={`Restore ${item.label ?? 'item'}`}
                              className="flex h-5 w-5 items-center justify-center rounded-tr-md bg-black/60 text-white hover:text-green-400"
                              onClick={() => restoreDeletedItem(item.id)}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            aria-label={`Permanently delete ${item.label ?? 'item'}`}
                            className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                            onClick={() => permanentlyDeleteItem(item.id)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              {/* display settings */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Display
                </h3>
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
              </section>

              {/* layout settings */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Layout
                </h3>
                <SettingRow label="Tier Label Width">
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
                <SettingRow label="Hide Row Controls">
                  <Toggle
                    checked={hideRowControls}
                    onChange={setHideRowControls}
                  />
                </SettingRow>
              </section>

              {/* export settings */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Export
                </h3>
                <SettingRow label="Background Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={exportBackgroundColor}
                      onChange={(e) => setExportBackgroundColor(e.target.value)}
                      className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[#555] bg-transparent"
                    />
                    <span className="text-xs text-[#888]">
                      {exportBackgroundColor}
                    </span>
                  </div>
                </SettingRow>
              </section>

              {/* data management */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Data
                </h3>
                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(true)}
                  className="flex items-center gap-1.5 rounded-md border border-[#555] bg-[#2b2b2b] px-3 py-1.5 text-sm text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All Items
                </button>

                {/* storage usage */}
                <div className="mt-3 pt-3 border-t border-[#444]">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-[#999]">Storage</span>
                    <span className="text-xs text-[#888]">
                      {storageMb.toFixed(1)} MB / {storageMaxMb} MB
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#333]">
                    <div
                      className={`h-full rounded-full transition-all ${storageColor}`}
                      style={{ width: `${storagePercent}%` }}
                    />
                  </div>
                </div>
              </section>

              {/* lists */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Lists
                </h3>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-[#999]">
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
                    className="flex items-center gap-1.5 rounded-md border border-[#555] bg-[#2b2b2b] px-3 py-1.5 text-sm text-slate-200 hover:border-[#777] hover:bg-[#333]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New List
                  </button>
                </div>
                <p className="mt-2 text-xs text-[#666]">
                  Switch between lists using the button in the bottom-right
                  corner.
                </p>
              </section>

              {/* behavior settings */}
              <section className="rounded-lg border border-[#444] bg-[#272727] p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-100">
                  Behavior
                </h3>
                <SettingRow label="Confirm Before Delete">
                  <Toggle
                    checked={confirmBeforeDelete}
                    onChange={setConfirmBeforeDelete}
                  />
                </SettingRow>
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear deleted items?"
        description="This will permanently remove all deleted items. This cannot be undone."
        confirmText="Clear all"
        onConfirm={() =>
        {
          clearDeletedItems()
          setShowClearConfirm(false)
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

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
