// src/features/workspace/export/lib/exportBoardRender.tsx
// isolated hidden React renderer for export capture sessions

import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { ExportAppearance } from '../model/runtime'
import {
  normalizeExportItemsPerRow,
  type AppPreferences,
} from '@tierlistbuilder/contracts/platform/preferences'
import { StaticExportBoard } from '~/features/workspace/export/ui/StaticExportBoard'
import { EXPORT_BOARD_ROOT_SELECTOR } from '~/shared/board-ui/boardTestIds'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import { Z } from '~/shared/theme/zIndex'

const EXPORT_CAPTURE_HOST_ID = 'export-capture-host'
const EXPORT_IMAGE_READY_TIMEOUT_MS = 10_000

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

// pick only the preferences that affect export board rendering
export const getExportAppearance = (
  preferences: AppPreferences
): ExportAppearance => ({
  itemSize: preferences.itemSize,
  showLabels: preferences.showLabels,
  defaultLabelPlacementMode: preferences.defaultLabelPlacementMode,
  itemShape: preferences.itemShape,
  compactMode: preferences.compactMode,
  maxItemsPerRow: normalizeExportItemsPerRow(preferences.exportItemsPerRow),
  labelWidth: preferences.labelWidth,
  paletteId: preferences.paletteId,
  textStyleId: preferences.textStyleId,
  tierLabelBold: preferences.tierLabelBold,
  tierLabelItalic: preferences.tierLabelItalic,
  tierLabelFontSize: preferences.tierLabelFontSize,
})

const waitForNextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()))

const waitForImageLoadEvent = (image: HTMLImageElement): Promise<void> =>
  new Promise((resolve) =>
  {
    const finish = () =>
    {
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      resolve()
    }

    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })

const waitForImageReady = async (image: HTMLImageElement): Promise<void> =>
{
  if (image.complete)
  {
    return
  }

  const loadPromise =
    typeof image.decode === 'function'
      ? image.decode().catch(() => undefined)
      : waitForImageLoadEvent(image)
  let timeoutId: number | undefined

  try
  {
    await Promise.race([
      loadPromise,
      new Promise<void>((_, reject) =>
      {
        timeoutId = window.setTimeout(
          () => reject(new Error('Timed out waiting for export image.')),
          EXPORT_IMAGE_READY_TIMEOUT_MS
        )
      }),
    ])
  }
  finally
  {
    if (timeoutId !== undefined)
    {
      window.clearTimeout(timeoutId)
    }
  }
}

// wait for web fonts, image decode, & a paint tick before capture
const waitForExportBoardReady = async (element: HTMLElement): Promise<void> =>
{
  if ('fonts' in document)
  {
    await document.fonts.ready
  }

  const images = Array.from(element.querySelectorAll<HTMLImageElement>('img'))

  await Promise.all(images.map(waitForImageReady))

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
  host.style.zIndex = String(Z.offscreen)
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
      await warmFromBoard(data)

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

      const board = host.querySelector<HTMLElement>(EXPORT_BOARD_ROOT_SELECTOR)

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
