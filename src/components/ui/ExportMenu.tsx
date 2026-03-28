// src/components/ui/ExportMenu.tsx
// export dropdown w/ nested hover submenus for image, PDF, JSON, & export-all

import { useCallback, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FileDown,
  FileUp,
  Layers,
  SquareArrowUp,
} from 'lucide-react'

import type { ImageFormat } from '../../types'
import { usePopupClose } from '../../hooks/usePopupClose'
import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import {
  extractBoardData,
  useTierListStore,
} from '../../store/useTierListStore'
import { exportBoardAsJson, parseBoardsJson } from '../../utils/exportJson'
import { ActionButton } from './ActionButton'

// display labels for the image format selector
const FORMAT_LABELS: Record<ImageFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
}

interface ExportMenuProps
{
  // active export type while an export is in progress (null when idle)
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  // true while an "Export All" operation is running
  exportingAll: boolean
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
}

export const ExportMenu = ({
  exportStatus,
  exportingAll,
  onExport,
  onCopyToClipboard,
  onExportAll,
}: ExportMenuProps) =>
{
  const boardCount = useBoardManagerStore((state) => state.boards.length)
  const title = useTierListStore((state) => state.title)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)
  const importBoard = useBoardManagerStore((state) => state.importBoard)
  const importBoards = useBoardManagerStore((state) => state.importBoards)

  const [showMenu, setShowMenu] = useState(false)
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)

  const handleJsonExport = () =>
  {
    const data = extractBoardData(useTierListStore.getState())
    exportBoardAsJson(data, title)
    setShowMenu(false)
  }

  const handleJsonImport = async (file: File) =>
  {
    try
    {
      const text = await file.text()
      const boards = parseBoardsJson(text)
      if (boards.length === 1)
      {
        importBoard(boards[0])
      }
      else
      {
        importBoards(boards)
      }
    }
    catch (err)
    {
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to import JSON file.'
      )
    }
    setShowMenu(false)
  }

  usePopupClose({
    show: showMenu,
    triggerRef: buttonRef,
    popupRef: menuRef,
    onClose: useCallback(() => setShowMenu(false), []),
  })

  return (
    <>
      <div className="relative">
        <ActionButton
          ref={buttonRef}
          label="Open export options"
          title="Export"
          onClick={() =>
          {
            if (!showMenu) setShowMenu(true)
          }}
          disabled={exportStatus !== null || exportingAll}
          hasPopup="menu"
          expanded={showMenu}
        >
          <SquareArrowUp className="h-5 w-5" strokeWidth={1.8} />
        </ActionButton>

        {showMenu && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute left-1/2 top-full z-30 mt-3 w-max -translate-x-1/2 rounded-xl bg-[var(--t-bg-overlay)] p-1.5 text-sm shadow-md shadow-black/30"
          >
            {/* image submenu — hover to reveal download, copy, & format options */}
            <div className="group/img relative">
              <div
                role="menuitem"
                className="flex w-full cursor-default items-center justify-between gap-6 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
              >
                Export Image
                <ChevronRight className="h-3.5 w-3.5 text-[var(--t-text-faint)]" />
              </div>
              <div className="invisible absolute left-full -top-1.5 z-40 ml-1 w-max rounded-xl bg-[var(--t-bg-overlay)] p-1.5 text-sm opacity-0 shadow-md shadow-black/30 transition-all group-hover/img:visible group-hover/img:opacity-100">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-45"
                  onClick={() =>
                  {
                    setShowMenu(false)
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
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-45"
                  onClick={() =>
                  {
                    setShowMenu(false)
                    void onCopyToClipboard()
                  }}
                  disabled={exportStatus !== null}
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-nowrap">Copy to Clipboard</span>
                </button>

                <div className="my-1 border-t border-[var(--t-border)]" />

                {/* format selector — nested sub-submenu w/ checkmark on active format */}
                <div className="group/format relative">
                  <div
                    role="menuitem"
                    className="flex w-full cursor-default items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
                  >
                    {FORMAT_LABELS[imageFormat]}
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--t-text-faint)]" />
                  </div>
                  <div className="invisible absolute left-full -top-1.5 z-50 ml-1 w-max rounded-xl bg-[var(--t-bg-overlay)] p-1.5 text-sm opacity-0 shadow-md shadow-black/30 transition-all group-hover/format:visible group-hover/format:opacity-100">
                    {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
                        onClick={() => setImageFormat(fmt)}
                      >
                        {imageFormat === fmt ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" />
                        )}
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
              className="flex w-full rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-45"
              onClick={() =>
              {
                setShowMenu(false)
                void onExport('pdf')
              }}
              disabled={exportStatus !== null}
            >
              Export PDF
            </button>

            <div className="my-1 border-t border-[var(--t-border)]" />

            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
              onClick={handleJsonExport}
            >
              <FileDown className="h-3.5 w-3.5 shrink-0" />
              Export JSON
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
              onClick={() =>
              {
                jsonInputRef.current?.click()
              }}
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" />
              Import JSON
            </button>

            {/* export all submenu — only shown when multiple boards exist */}
            {boardCount > 1 && (
              <>
                <div className="my-1 border-t border-[var(--t-border)]" />

                <div className="group/all relative">
                  <div
                    role="menuitem"
                    className="flex w-full cursor-default items-center justify-between gap-6 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      Export All ({boardCount})
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--t-text-faint)]" />
                  </div>
                  <div className="invisible absolute left-full -top-1.5 z-40 ml-1 w-max rounded-xl bg-[var(--t-bg-overlay)] p-1.5 text-sm opacity-0 shadow-md shadow-black/30 transition-all group-hover/all:visible group-hover/all:opacity-100">
                    {[
                      {
                        format: 'json' as const,
                        Icon: FileDown,
                        label: 'All as JSON',
                      },
                      {
                        format: 'pdf' as const,
                        Icon: FileDown,
                        label: 'All as PDF',
                      },
                      {
                        format: imageFormat,
                        Icon: Download,
                        label: `All as ${FORMAT_LABELS[imageFormat]} (ZIP)`,
                      },
                    ].map(({ format, Icon, label }) => (
                      <button
                        key={format}
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)]"
                        onClick={() =>
                        {
                          setShowMenu(false)
                          void onExportAll(format)
                        }}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* hidden file input for JSON import */}
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) =>
        {
          const file = e.target.files?.[0]
          if (file) void handleJsonImport(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
