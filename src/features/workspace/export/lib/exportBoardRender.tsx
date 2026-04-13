// src/features/workspace/export/lib/exportBoardRender.tsx
// isolated hidden React renderer for export capture sessions

import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

import type { BoardSnapshot } from '@/features/workspace/boards/model/contract'
import type { ExportAppearance } from '@/shared/types/export'
import type { AppSettings } from '@/shared/types/settings'
import { StaticExportBoard } from '@/features/workspace/export/ui/StaticExportBoard'

const EXPORT_CAPTURE_HOST_ID = 'export-capture-host'

interface ExportCaptureSession
{
  renderBoard: (data: BoardSnapshot) => Promise<HTMLElement>
  destroy: () => void
}

interface ExportCaptureSessionOptions
{
  appearance: ExportAppearance
  backgroundColor: string
}

// pick only the settings that affect export board rendering
export const getExportAppearance = (
  settings: AppSettings
): ExportAppearance => ({
  itemSize: settings.itemSize,
  showLabels: settings.showLabels,
  itemShape: settings.itemShape,
  compactMode: settings.compactMode,
  labelWidth: settings.labelWidth,
  paletteId: settings.paletteId,
  tierLabelBold: settings.tierLabelBold,
  tierLabelItalic: settings.tierLabelItalic,
  tierLabelFontSize: settings.tierLabelFontSize,
})

const waitForNextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))

// wait for web fonts, image decode, & a paint tick before capture
const waitForExportBoardReady = async (element: HTMLElement): Promise<void> =>
{
  if ('fonts' in document)
  {
    await document.fonts.ready
  }

  const images = Array.from(element.querySelectorAll<HTMLImageElement>('img'))

  await Promise.all(
    images.map(async (image) =>
    {
      if (image.complete)
      {
        return
      }

      if (typeof image.decode === 'function')
      {
        await image.decode().catch(() => undefined)
        return
      }

      await new Promise<void>((resolve) =>
      {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })
    })
  )

  await waitForNextFrame()
  await waitForNextFrame()
}

// create a stable off-screen host so capture never touches the live board DOM
const createCaptureHost = (): HTMLDivElement =>
{
  const host = document.createElement('div')
  host.id = EXPORT_CAPTURE_HOST_ID
  host.style.position = 'absolute'
  host.style.left = '-20000px'
  host.style.top = '0'
  host.style.pointerEvents = 'none'
  host.style.opacity = '1'
  host.style.zIndex = '-1'
  host.style.width = 'max-content'
  document.body.appendChild(host)
  return host
}

const createExportCaptureSession = ({
  appearance,
  backgroundColor,
}: ExportCaptureSessionOptions): ExportCaptureSession =>
{
  if (typeof document === 'undefined')
  {
    throw new Error('Export capture requires a browser document.')
  }

  const host = createCaptureHost()
  const root: Root = createRoot(host)

  return {
    renderBoard: async (data) =>
    {
      flushSync(() =>
      {
        root.render(
          <StaticExportBoard
            data={data}
            appearance={appearance}
            backgroundColor={backgroundColor}
          />
        )
      })

      const board = host.querySelector<HTMLElement>(
        '[data-testid="export-board-root"]'
      )

      if (!board)
      {
        throw new Error('Could not render export board.')
      }

      await waitForExportBoardReady(board)
      return board
    },
    destroy: () =>
    {
      root.unmount()
      host.remove()
    },
  }
}

// run an async action inside a managed export capture session w/ automatic cleanup
export const withExportSession = async <T,>(
  options: ExportCaptureSessionOptions,
  action: (session: ExportCaptureSession) => Promise<T>
): Promise<T> =>
{
  const session = createExportCaptureSession(options)
  try
  {
    return await action(session)
  }
  finally
  {
    session.destroy()
  }
}
