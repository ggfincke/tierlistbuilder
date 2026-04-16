// src/features/workspace/export/ui/ExportMenu.tsx
// export dropdown backed by a shared nested-menu tree for export actions

import { useId, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Highlighter,
  FileDown,
  FileUp,
  Layers,
  SquareArrowUp,
} from 'lucide-react'

import type { ImageFormat } from '~/shared/types/export'
import type { MenuPositionClasses } from '~/shared/layout/toolbarPosition'
import { useMenuOverflowFlipRefs } from '~/shared/overlay/useMenuOverflowFlip'
import {
  useNestedMenus,
  type NestedMenuDefinition,
} from '~/shared/overlay/useNestedMenus'
import { useDismissibleLayer } from '~/shared/overlay/useDismissibleLayer'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  importBoardSession,
  importBoardsSession,
} from '~/features/workspace/boards/data/local/localBoardSession'
import { extractBoardData } from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  exportBoardAsJson,
  parseBoardsJson,
} from '~/features/workspace/export/lib/exportJson'
import {
  FORMAT_LABELS,
  IMAGE_FORMATS,
} from '~/features/workspace/export/lib/constants'
import { ActionButton } from '~/shared/ui/ActionButton'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlayPrimitives'

type ExportMenuId = 'root' | 'image' | 'format' | 'exportAll'

const EXPORT_MENU_DEFINITIONS: readonly NestedMenuDefinition<ExportMenuId>[] = [
  { id: 'root' },
  { id: 'image', parentId: 'root' },
  { id: 'format', parentId: 'image' },
  { id: 'exportAll', parentId: 'root' },
]

interface ExportMenuProps
{
  menuPos: MenuPositionClasses
  exportStatus: ImageFormat | 'pdf' | 'clipboard' | null
  exportingAll: boolean
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onAnnotateExport: () => void
  onPreviewExport: () => void
}

export const ExportMenu = ({
  menuPos,
  exportStatus,
  exportingAll,
  onExport,
  onCopyToClipboard,
  onExportAll,
  onAnnotateExport,
  onPreviewExport,
}: ExportMenuProps) =>
{
  const boardCount = useWorkspaceBoardRegistryStore(
    (state) => state.boards.length
  )
  const title = useActiveBoardStore((state) => state.title)
  const setRuntimeError = useActiveBoardStore((state) => state.setRuntimeError)

  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)
  const isDisabled = exportStatus !== null || exportingAll
  const exportDialogId = useId()
  const imageOptionsGroupId = useId()
  const formatOptionsGroupId = useId()
  const exportAllOptionsGroupId = useId()
  const disabledMenuIds = useMemo(() =>
  {
    if (isDisabled)
    {
      return ['root', 'image', 'format', 'exportAll'] as const
    }

    if (boardCount < 2)
    {
      return ['exportAll'] as const
    }

    return [] as const
  }, [boardCount, isDisabled])
  const { getRef: getOverflowRef } = useMenuOverflowFlipRefs<ExportMenuId>()
  const { closeAllMenus, closeMenu, isOpen, toggleMenu } = useNestedMenus({
    definitions: EXPORT_MENU_DEFINITIONS,
    disabledIds: disabledMenuIds,
  })
  const showMenu = isOpen('root')
  const showImageMenu = isOpen('image')
  const showFormatMenu = isOpen('format')
  const showExportAllMenu = isOpen('exportAll')

  const handleJsonExport = async () =>
  {
    const data = extractBoardData(useActiveBoardStore.getState())
    try
    {
      await exportBoardAsJson(data, title)
    }
    catch (err)
    {
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to export JSON file.'
      )
    }
    closeAllMenus()
  }

  const handleJsonImport = async (file: File) =>
  {
    try
    {
      const text = await file.text()
      const boards = await parseBoardsJson(text)
      if (boards.length === 1)
      {
        await importBoardSession(boards[0])
      }
      else
      {
        await importBoardsSession(boards)
      }
    }
    catch (err)
    {
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to import JSON file.'
      )
    }
    closeAllMenus()
  }

  useDismissibleLayer({
    open: showMenu,
    triggerRef: buttonRef,
    layerRef: menuRef,
    onDismiss: closeAllMenus,
  })

  return (
    <>
      <div className="relative">
        <ActionButton
          ref={buttonRef}
          label="Open export options"
          title="Export"
          onClick={() => toggleMenu('root')}
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
            <div className="relative">
              <OverlayMenuItem
                aria-controls={imageOptionsGroupId}
                aria-haspopup="dialog"
                aria-expanded={showImageMenu}
                className={`${showImageMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-6`}
                onClick={() => toggleMenu('image')}
              >
                Export Image
                <ChevronRight
                  className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                />
              </OverlayMenuItem>

              {showImageMenu && (
                <OverlayMenuSurface
                  id={imageOptionsGroupId}
                  ref={getOverflowRef('image')}
                  role="group"
                  aria-label="Image export options"
                  className={`${menuPos.sub} text-sm shadow-md shadow-black/30 ${menuPos.subBridge}`}
                >
                  <OverlayMenuItem
                    onClick={() =>
                    {
                      closeAllMenus()
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
                      closeAllMenus()
                      void onCopyToClipboard()
                    }}
                    className="disabled:opacity-45"
                    disabled={exportStatus !== null}
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Copy to Clipboard</span>
                  </OverlayMenuItem>
                  <OverlayMenuItem
                    onClick={() =>
                    {
                      closeAllMenus()
                      onPreviewExport()
                    }}
                    className="disabled:opacity-45"
                    disabled={exportStatus !== null}
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    Preview
                  </OverlayMenuItem>
                  <OverlayMenuItem
                    onClick={() =>
                    {
                      closeAllMenus()
                      onAnnotateExport()
                    }}
                    className="disabled:opacity-45"
                    disabled={exportStatus !== null}
                  >
                    <Highlighter className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">
                      Annotate &amp; Export
                    </span>
                  </OverlayMenuItem>

                  <OverlayDivider />

                  {/* format selector — click to reveal format choices */}
                  <div className="relative">
                    <OverlayMenuItem
                      aria-controls={formatOptionsGroupId}
                      aria-haspopup="dialog"
                      aria-expanded={showFormatMenu}
                      className={`${showFormatMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-4`}
                      onClick={() => toggleMenu('format')}
                    >
                      {FORMAT_LABELS[imageFormat]}
                      <ChevronRight
                        className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                      />
                    </OverlayMenuItem>

                    {showFormatMenu && (
                      <OverlayMenuSurface
                        id={formatOptionsGroupId}
                        ref={getOverflowRef('format')}
                        role="group"
                        aria-label="Image format options"
                        className={`${menuPos.sub} z-50 text-sm shadow-md shadow-black/30 ${menuPos.subBridge}`}
                      >
                        {IMAGE_FORMATS.map((fmt) => (
                          <OverlayMenuItem
                            key={fmt}
                            onClick={() =>
                            {
                              setImageFormat(fmt)
                              closeMenu('format')
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
                  </div>
                </OverlayMenuSurface>
              )}
            </div>

            <OverlayMenuItem
              onClick={() =>
              {
                closeAllMenus()
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
                closeAllMenus()
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

                <div className="relative">
                  <OverlayMenuItem
                    aria-controls={exportAllOptionsGroupId}
                    aria-haspopup="dialog"
                    aria-expanded={showExportAllMenu}
                    className={`${showExportAllMenu ? 'bg-[rgb(var(--t-overlay)/0.06)]' : ''} group justify-between gap-6`}
                    onClick={() => toggleMenu('exportAll')}
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      Export All ({boardCount})
                    </span>
                    <ChevronRight
                      className={`h-3.5 w-3.5 text-[var(--t-text-faint)] transition-colors group-hover:text-[var(--t-text-secondary)] ${menuPos.chevronClass}`}
                    />
                  </OverlayMenuItem>

                  {showExportAllMenu && (
                    <OverlayMenuSurface
                      id={exportAllOptionsGroupId}
                      ref={getOverflowRef('exportAll')}
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
                            closeAllMenus()
                            void onExportAll(format)
                          }}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {label}
                        </OverlayMenuItem>
                      ))}
                    </OverlayMenuSurface>
                  )}
                </div>
              </>
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
