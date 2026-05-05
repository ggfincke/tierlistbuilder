// src/features/workspace/export/ui/ExportMenu.tsx
// export dropdown backed by a shared nested-menu tree for export actions

import { useId, useMemo, useRef } from 'react'
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
  Send,
  Share2,
  SquareArrowUp,
} from 'lucide-react'

import type { ImageFormat } from '../model/runtime'
import type { ExportStatus } from '../model/useExportController'
import type { MenuPositionClasses } from '~/shared/layout/toolbarPosition'
import { formatError } from '~/shared/lib/errors'
import {
  preloadHtmlToImageLib,
  preloadPdfLib,
  preloadZipLib,
} from '~/shared/lib/lazyDependencies'
import {
  useNestedMenus,
  type NestedMenuDefinition,
} from '~/shared/overlay/nestedMenus'
import { useDismissibleLayer } from '~/shared/overlay/dismissibleLayer'
import { useMenuOverflowFlipRefs } from '~/shared/overlay/menuOverflow'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  importBoardSession,
  importBoardsSession,
} from '~/features/workspace/boards/model/boardSession'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { exportBoardAsJson } from '~/features/workspace/export/lib/exportJson'
import { parseBoardsJson } from '~/shared/board-data/boardJson'
import {
  IMAGE_FORMATS,
  IMAGE_FORMAT_META,
} from '~/features/workspace/export/lib/constants'
import { ActionButton } from '~/shared/ui/ActionButton'
import {
  OverlayDivider,
  OverlayMenuItem,
  OverlayMenuSurface,
} from '~/shared/overlay/OverlaySurface'

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
  exportStatus: ExportStatus
  exportingAll: boolean
  imageFormat: ImageFormat
  onImageFormatChange: (format: ImageFormat) => void
  onExport: (format: ImageFormat | 'pdf') => Promise<void>
  onCopyToClipboard: () => Promise<void>
  onExportAll: (format: 'json' | 'pdf' | ImageFormat) => Promise<void>
  onAnnotateExport: () => void
  onPreviewExport: () => void
  onShare: () => void
  onPublishRanking: (() => void) | null
}

const preloadImageExport = () => preloadHtmlToImageLib()
const preloadPdfExport = () =>
{
  preloadHtmlToImageLib()
  preloadPdfLib()
}
const preloadImageZipExport = () =>
{
  preloadHtmlToImageLib()
  preloadZipLib()
}
const preloadBulkExport = () =>
{
  preloadHtmlToImageLib()
  preloadPdfLib()
  preloadZipLib()
}

// Export-All submenu rows — each row carries its own preloader so we don't
// re-derive it from a `format === 'json' ? … : format === 'pdf' ? …` ladder
// at every render
interface ExportAllRow
{
  key: string
  format: 'json' | 'pdf' | ImageFormat
  Icon: typeof FileDown
  preload?: () => void
  buildLabel: (imageFormat: ImageFormat) => string
}

const EXPORT_ALL_ROWS: readonly ExportAllRow[] = [
  {
    key: 'json',
    format: 'json',
    Icon: FileDown,
    buildLabel: () => 'All as JSON',
  },
  {
    key: 'pdf',
    format: 'pdf',
    Icon: FileDown,
    preload: preloadPdfExport,
    buildLabel: () => 'All as PDF',
  },
  {
    key: 'images',
    // resolved at click time so the row tracks the current image-format pick
    format: 'png',
    Icon: Download,
    preload: preloadImageZipExport,
    buildLabel: (fmt) => `All as ${IMAGE_FORMAT_META[fmt].label} (ZIP)`,
  },
]

export const ExportMenu = ({
  menuPos,
  exportStatus,
  exportingAll,
  imageFormat,
  onImageFormatChange,
  onExport,
  onCopyToClipboard,
  onExportAll,
  onAnnotateExport,
  onPreviewExport,
  onShare,
  onPublishRanking,
}: ExportMenuProps) =>
{
  const boardCount = useWorkspaceBoardRegistryStore(
    (state) => state.boards.length
  )
  const title = useActiveBoardStore((state) => state.title)
  const setRuntimeError = useActiveBoardStore((state) => state.setRuntimeError)

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

  const handleJsonExport = async (): Promise<void> =>
  {
    const data = extractBoardData(useActiveBoardStore.getState())
    try
    {
      await exportBoardAsJson(data, title)
    }
    catch (err)
    {
      setRuntimeError(formatError(err, 'Failed to export JSON file.'))
    }
    finally
    {
      closeAllMenus()
    }
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
      setRuntimeError(formatError(err, 'Failed to import JSON file.'))
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
                onFocus={preloadImageExport}
                onPointerEnter={preloadImageExport}
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
                    onFocus={preloadImageExport}
                    onPointerEnter={preloadImageExport}
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
                    onFocus={preloadImageExport}
                    onPointerEnter={preloadImageExport}
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
                    onFocus={preloadImageExport}
                    onPointerEnter={preloadImageExport}
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
                    onFocus={preloadImageExport}
                    onPointerEnter={preloadImageExport}
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
                      {IMAGE_FORMAT_META[imageFormat].label}
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
                              onImageFormatChange(fmt)
                              closeMenu('format')
                            }}
                          >
                            {imageFormat === fmt ? (
                              <Check className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <span className="h-3.5 w-3.5 shrink-0" />
                            )}
                            {IMAGE_FORMAT_META[fmt].label}
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
              onFocus={preloadPdfExport}
              onPointerEnter={preloadPdfExport}
              className="disabled:opacity-45"
              disabled={exportStatus !== null}
            >
              Export PDF
            </OverlayMenuItem>

            <OverlayMenuItem
              onClick={() =>
              {
                closeAllMenus()
                onShare()
              }}
            >
              <Share2 className="h-3.5 w-3.5 shrink-0" />
              Share Link
            </OverlayMenuItem>

            {onPublishRanking && (
              <OverlayMenuItem
                onClick={() =>
                {
                  closeAllMenus()
                  onPublishRanking()
                }}
              >
                <Send className="h-3.5 w-3.5 shrink-0" />
                Publish Ranking
              </OverlayMenuItem>
            )}

            <OverlayDivider />

            <OverlayMenuItem onClick={() => void handleJsonExport()}>
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
                    onFocus={preloadBulkExport}
                    onPointerEnter={preloadBulkExport}
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
                      {EXPORT_ALL_ROWS.map(
                        ({ key, format, Icon, preload, buildLabel }) => (
                          <OverlayMenuItem
                            key={key}
                            onFocus={preload}
                            onPointerEnter={preload}
                            onClick={() =>
                            {
                              closeAllMenus()
                              // for the image-zip row, route through the
                              // user's currently picked image format
                              const resolved =
                                key === 'images' ? imageFormat : format
                              void onExportAll(resolved)
                            }}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            {buildLabel(imageFormat)}
                          </OverlayMenuItem>
                        )
                      )}
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
