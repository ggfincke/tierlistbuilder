// src/components/ui/ExportMenu.tsx
// export dropdown w/ click-open submenus for image, PDF, JSON, & export-all

import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
import type { MenuPositionClasses } from '../../utils/menuPosition'
import { useHybridMenu } from '../../hooks/useHybridMenu'
import { useMenuOverflowFlip } from '../../hooks/useMenuOverflowFlip'
import { usePopupClose } from '../../hooks/usePopupClose'
import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import {
  importBoardSession,
  importBoardsSession,
} from '../../services/boardSession'
import { extractBoardData } from '../../domain/boardData'
import { useTierListStore } from '../../store/useTierListStore'
import { exportBoardAsJson, parseBoardsJson } from '../../utils/exportJson'
import { ActionButton } from './ActionButton'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from './OverlayPrimitives'

// display labels for the image format selector
const FORMAT_LABELS: Record<ImageFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
}

interface ExportMenuProps
{
  menuPos: MenuPositionClasses
  // active export type while an export is in progress (null when idle)
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  // true while an "Export All" operation is running
  exportingAll: boolean
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
}

export const ExportMenu = ({
  menuPos,
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

  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)
  const isDisabled = exportStatus !== null || exportingAll
  const exportDialogId = useId()
  const imageOptionsGroupId = useId()
  const formatOptionsGroupId = useId()
  const exportAllOptionsGroupId = useId()

  const {
    open: showMenu,
    closeMenu: closeRootMenu,
    togglePinnedOpen: toggleRootMenu,
  } = useHybridMenu({ disabled: isDisabled })

  const {
    open: showImageMenu,
    closeMenu: closeImageMenu,
    togglePinnedOpen: toggleImageMenu,
  } = useHybridMenu({ disabled: isDisabled })

  const {
    open: showFormatMenu,
    closeMenu: closeFormatMenu,
    togglePinnedOpen: toggleFormatMenu,
  } = useHybridMenu({ disabled: isDisabled })

  const {
    open: showExportAllMenu,
    closeMenu: closeExportAllMenu,
    togglePinnedOpen: toggleExportAllMenu,
  } = useHybridMenu({
    disabled: isDisabled || boardCount < 2,
  })

  // close the full export menu tree together
  const closeExportMenu = useCallback(() =>
  {
    closeRootMenu()
    closeImageMenu()
    closeFormatMenu()
    closeExportAllMenu()
  }, [closeExportAllMenu, closeFormatMenu, closeImageMenu, closeRootMenu])

  const handleJsonExport = () =>
  {
    const data = extractBoardData(useTierListStore.getState())
    exportBoardAsJson(data, title)
    closeExportMenu()
  }

  const handleJsonImport = async (file: File) =>
  {
    try
    {
      const text = await file.text()
      const boards = parseBoardsJson(text)
      if (boards.length === 1)
      {
        importBoardSession(boards[0])
      }
      else
      {
        importBoardsSession(boards)
      }
    }
    catch (err)
    {
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to import JSON file.'
      )
    }
    closeExportMenu()
  }

  // collapse nested menus whenever the root menu closes
  useEffect(() =>
  {
    if (!showMenu)
    {
      closeImageMenu()
      closeFormatMenu()
      closeExportAllMenu()
    }
  }, [closeExportAllMenu, closeFormatMenu, closeImageMenu, showMenu])

  // close the format submenu when its parent image menu collapses
  useEffect(() =>
  {
    if (!showImageMenu)
    {
      closeFormatMenu()
    }
  }, [closeFormatMenu, showImageMenu])

  const { ref: imageFlipRef } = useMenuOverflowFlip()
  const { ref: formatFlipRef } = useMenuOverflowFlip()
  const { ref: exportAllFlipRef } = useMenuOverflowFlip()

  usePopupClose({
    show: showMenu,
    triggerRef: buttonRef,
    popupRef: menuRef,
    onClose: closeExportMenu,
  })

  return (
    <>
      <div className="relative">
        <ActionButton
          ref={buttonRef}
          label="Open export options"
          title="Export"
          onClick={toggleRootMenu}
          disabled={isDisabled}
          hasPopup="dialog"
          expanded={showMenu}
          controlsId={exportDialogId}
          active={showMenu}
        >
          <SquareArrowUp className="h-5 w-5" strokeWidth={1.8} />
        </ActionButton>

        {showMenu && (
          <OverlayMenuSurface
            id={exportDialogId}
            ref={menuRef}
            role="dialog"
            aria-label="Export options"
            className={`${menuPos.primary} ${menuPos.animationClass} text-sm shadow-md shadow-black/30 ${menuPos.bridge}`}
          >
            {/* image submenu — click to reveal download, copy, & format options */}
            <OverlayMenuItem
              aria-controls={imageOptionsGroupId}
              aria-haspopup="dialog"
              aria-expanded={showImageMenu}
              className={`${showImageMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-6`}
              onClick={() =>
              {
                closeExportAllMenu()
                toggleImageMenu()
              }}
            >
              Export Image
              <ChevronRight
                className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
              />
            </OverlayMenuItem>

            <OverlayMenuItem
              onClick={() =>
              {
                closeExportMenu()
                void onExport('pdf')
              }}
              className="disabled:opacity-45"
              disabled={exportStatus !== null}
            >
              Export PDF
            </OverlayMenuItem>

            <OverlayDivider />

            <OverlayMenuItem onClick={handleJsonExport}>
              <FileDown className="h-3.5 w-3.5 shrink-0" />
              Export JSON
            </OverlayMenuItem>
            <OverlayMenuItem
              onClick={() =>
              {
                closeExportMenu()
                jsonInputRef.current?.click()
              }}
            >
              <FileUp className="h-3.5 w-3.5 shrink-0" />
              Import JSON
            </OverlayMenuItem>

            {/* export all submenu — only shown when multiple boards exist */}
            {boardCount > 1 && (
              <>
                <OverlayDivider />

                <OverlayMenuItem
                  aria-controls={exportAllOptionsGroupId}
                  aria-haspopup="dialog"
                  aria-expanded={showExportAllMenu}
                  className={`${showExportAllMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-6`}
                  onClick={() =>
                  {
                    closeImageMenu()
                    closeFormatMenu()
                    toggleExportAllMenu()
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    Export All ({boardCount})
                  </span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                  />
                </OverlayMenuItem>
              </>
            )}

            {showImageMenu && (
              <OverlayMenuSurface
                id={imageOptionsGroupId}
                ref={imageFlipRef}
                role="group"
                aria-label="Image export options"
                className={`${menuPos.sub} text-sm shadow-md shadow-black/30 ${menuPos.subBridge}`}
              >
                <OverlayMenuItem
                  onClick={() =>
                  {
                    closeExportMenu()
                    void onExport(imageFormat)
                  }}
                  className="disabled:opacity-45"
                  disabled={exportStatus !== null}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  Download
                </OverlayMenuItem>
                <OverlayMenuItem
                  onClick={() =>
                  {
                    closeExportMenu()
                    void onCopyToClipboard()
                  }}
                  className="disabled:opacity-45"
                  disabled={exportStatus !== null}
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-nowrap">Copy to Clipboard</span>
                </OverlayMenuItem>

                <OverlayDivider />

                {/* format selector — click to reveal format choices */}
                <OverlayMenuItem
                  aria-controls={formatOptionsGroupId}
                  aria-haspopup="dialog"
                  aria-expanded={showFormatMenu}
                  className={`${showFormatMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-4`}
                  onClick={toggleFormatMenu}
                >
                  {FORMAT_LABELS[imageFormat]}
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                  />
                </OverlayMenuItem>

                {showFormatMenu && (
                  <OverlayMenuSurface
                    id={formatOptionsGroupId}
                    ref={formatFlipRef}
                    role="group"
                    aria-label="Image format options"
                    className={`${menuPos.sub} z-50 text-sm shadow-md shadow-black/30 ${menuPos.subBridge}`}
                  >
                    {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                      <OverlayMenuItem
                        key={fmt}
                        onClick={() =>
                        {
                          setImageFormat(fmt)
                          closeFormatMenu()
                        }}
                      >
                        {imageFormat === fmt ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {FORMAT_LABELS[fmt]}
                      </OverlayMenuItem>
                    ))}
                  </OverlayMenuSurface>
                )}
              </OverlayMenuSurface>
            )}

            {boardCount > 1 && showExportAllMenu && (
              <OverlayMenuSurface
                id={exportAllOptionsGroupId}
                ref={exportAllFlipRef}
                role="group"
                aria-label="Export all options"
                className={`${menuPos.sub} text-sm shadow-md shadow-black/30 ${menuPos.subBridge}`}
              >
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
                  <OverlayMenuItem
                    key={format}
                    onClick={() =>
                    {
                      closeExportMenu()
                      void onExportAll(format)
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </OverlayMenuItem>
                ))}
              </OverlayMenuSurface>
            )}
          </OverlayMenuSurface>
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
