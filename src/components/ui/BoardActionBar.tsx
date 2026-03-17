// src/components/ui/BoardActionBar.tsx
// floating action bar — add tier, settings, export, & reset controls
import { forwardRef, useCallback, useRef, useState, type ReactNode } from 'react'

import { Check, ChevronRight, Copy, Download, FileDown, FileUp, Plus, Redo2, RotateCcw, Settings as SettingsIcon, SquareArrowUp, Undo2 } from 'lucide-react'

import type { ImageFormat } from '../../types'

import { usePopupClose } from '../../hooks/usePopupClose'
import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { extractBoardData, useTierListStore } from '../../store/useTierListStore'
import { exportBoardAsJson, parseBoardJson } from '../../utils/exportJson'
import { ConfirmDialog } from './ConfirmDialog'

// display labels for the image format selector
const FORMAT_LABELS: Record<ImageFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
}

interface BoardActionBarProps {
  // active export type while an export is in progress (null when idle)
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  onAddTier: () => void
  onOpenSettings: () => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onReset: () => void
}

// props for the shared icon button used throughout the action bar
interface ActionButtonProps {
  // accessible label for screen readers
  label: string
  // tooltip text shown on hover
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  // set to "menu" when the button toggles a popup menu
  hasPopup?: 'menu'
  // current open state of the associated popup (only used w/ hasPopup)
  expanded?: boolean
}

// reusable circular icon button w/ consistent sizing & disabled styles
const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(({
  label,
  title,
  onClick,
  disabled = false,
  children,
  hasPopup,
  expanded,
}, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={title}
    aria-haspopup={hasPopup}
    aria-expanded={hasPopup ? expanded : undefined}
    disabled={disabled}
    onClick={onClick}
    className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-white/12 bg-[#232323] text-slate-100 transition hover:border-white/22 hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-45"
  >
    {children}
  </button>
))

// * primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  exportStatus,
  onAddTier,
  onOpenSettings,
  onExport,
  onCopyToClipboard,
  onReset,
}: BoardActionBarProps) => {
  const pastLength = useTierListStore((state) => state.past.length)
  const futureLength = useTierListStore((state) => state.future.length)
  const undo = useTierListStore((state) => state.undo)
  const redo = useTierListStore((state) => state.redo)
  const title = useTierListStore((state) => state.title)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)
  const importBoard = useBoardManagerStore((state) => state.importBoard)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const [confirmReset, setConfirmReset] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)

  const handleJsonExport = () => {
    const data = extractBoardData(useTierListStore.getState())
    exportBoardAsJson(data, title)
    setShowExportMenu(false)
  }

  const handleJsonImport = async (file: File) => {
    try {
      const text = await file.text()
      const data = parseBoardJson(text)
      importBoard(data)
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Failed to import JSON file.')
    }
    setShowExportMenu(false)
  }

  usePopupClose({
    show: showExportMenu,
    triggerRef: exportButtonRef,
    popupRef: exportMenuRef,
    onClose: useCallback(() => setShowExportMenu(false), []),
  })

  return (
    <>
      <div className="mt-3 flex justify-center">
        <div className="inline-flex items-center gap-5 rounded-[1.7rem] border border-white/12 bg-[#272727] px-8 py-2">
          {/* undo & redo controls */}
          <ActionButton
            label="Undo"
            title="Undo"
            onClick={undo}
            disabled={pastLength === 0}
          >
            <Undo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          <ActionButton
            label="Redo"
            title="Redo"
            onClick={redo}
            disabled={futureLength === 0}
          >
            <Redo2 className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* add a new tier row to the bottom of the board */}
          <ActionButton
            label="Add tier"
            title="Add Tier"
            onClick={onAddTier}
          >
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* open the settings panel for image import & tier management */}
          <ActionButton
            label="Open settings"
            title="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* export button w/ PNG/PDF dropdown menu */}
          <div className="relative">
            <ActionButton
              ref={exportButtonRef}
              label="Open export options"
              title="Export"
              onClick={() => {
                if (!showExportMenu) setShowExportMenu(true)
              }}
              disabled={exportStatus !== null}
              hasPopup="menu"
              expanded={showExportMenu}
            >
              <SquareArrowUp className="h-5 w-5" strokeWidth={1.8} />
            </ActionButton>

            {showExportMenu && (
              <div
                ref={exportMenuRef}
                role="menu"
                className="absolute left-1/2 top-full z-30 mt-3 w-max -translate-x-1/2 rounded-xl bg-[#1e1e1e] p-1.5 text-sm shadow-md shadow-black/30"
              >
                {/* image submenu — hover to reveal download, copy, & format options */}
                <div className="group/img relative">
                  <div
                    role="menuitem"
                    className="flex w-full cursor-default items-center justify-between gap-6 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6"
                  >
                    Export Image
                    <ChevronRight className="h-3.5 w-3.5 text-[#888]" />
                  </div>
                  <div className="invisible absolute left-full -top-1.5 z-40 ml-1 w-max rounded-xl bg-[#1e1e1e] p-1.5 text-sm opacity-0 shadow-md shadow-black/30 transition-all group-hover/img:visible group-hover/img:opacity-100">
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6 disabled:opacity-45"
                      onClick={() => {
                        setShowExportMenu(false)
                        void onExport(imageFormat)
                      }}
                      disabled={exportStatus !== null}
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      Download
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6 disabled:opacity-45"
                      onClick={() => {
                        setShowExportMenu(false)
                        void onCopyToClipboard()
                      }}
                      disabled={exportStatus !== null}
                    >
                      <Copy className="h-3.5 w-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Copy to Clipboard</span>
                    </button>

                    <div className="my-1 border-t border-[#444]" />

                    {/* format selector — nested sub-submenu w/ checkmark on active format */}
                    <div className="group/format relative">
                      <div
                        role="menuitem"
                        className="flex w-full cursor-default items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6"
                      >
                        {FORMAT_LABELS[imageFormat]}
                        <ChevronRight className="h-3.5 w-3.5 text-[#888]" />
                      </div>
                      <div className="invisible absolute left-full -top-1.5 z-50 ml-1 w-max rounded-xl bg-[#1e1e1e] p-1.5 text-sm opacity-0 shadow-md shadow-black/30 transition-all group-hover/format:visible group-hover/format:opacity-100">
                        {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6"
                            onClick={() => setImageFormat(fmt)}
                          >
                            {imageFormat === fmt
                              ? <Check className="h-3.5 w-3.5 shrink-0" />
                              : <span className="h-3.5 w-3.5 shrink-0" />}
                            {FORMAT_LABELS[fmt]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6 disabled:opacity-45"
                  onClick={() => {
                    setShowExportMenu(false)
                    void onExport('pdf')
                  }}
                  disabled={exportStatus !== null}
                >
                  Export PDF
                </button>

                <div className="my-1 border-t border-[#444]" />

                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6"
                  onClick={handleJsonExport}
                >
                  <FileDown className="h-3.5 w-3.5 shrink-0" />
                  Export JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-100 transition hover:bg-white/6"
                  onClick={() => {
                    jsonInputRef.current?.click()
                  }}
                >
                  <FileUp className="h-3.5 w-3.5 shrink-0" />
                  Import JSON
                </button>
              </div>
            )}
          </div>

          {/* reset — requires confirmation before reloading sample items */}
          <ActionButton
            label="Reset board"
            title="Reset"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>
        </div>
      </div>

      {/* hidden file input for JSON import */}
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleJsonImport(file)
          e.target.value = ''
        }}
      />

      {/* confirmation dialog shown before the destructive reset action */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset board?"
        description="This restores the default tiers and the sample image pack."
        confirmText="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onReset()
          setConfirmReset(false)
        }}
      />
    </>
  )
}
