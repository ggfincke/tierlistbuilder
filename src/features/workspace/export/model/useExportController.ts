// src/features/workspace/export/model/useExportController.ts
// export controller hook — board export commands, progress, & runtime
// error handling. single-board paths share guardExport for the busy lock

import { useCallback, useEffect, useRef, useState } from 'react'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { extractBoardData } from '~/shared/board-data/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { formatError } from '~/shared/lib/errors'
import { THEMES } from '~/shared/theme/tokens'
import type { ImageFormat } from './runtime'
import { toast } from '~/shared/notifications/useToastStore'
import {
  exportAllBoardsAsImages,
  exportAllBoardsAsJson,
  exportAllBoardsAsPdf,
} from '~/features/workspace/export/lib/exportAll'
import {
  copyBoardToClipboard,
  exportTierListAsImage,
  renderToDataUrl,
} from '~/features/workspace/export/lib/exportImage'
import {
  getExportAppearance,
  withExportSession,
} from '~/features/workspace/export/lib/exportBoardRender'
import { exportTierListAsPdf } from '~/features/workspace/export/lib/exportPdf'

const FALLBACK_EXPORT_ERROR =
  'Export failed. Try again after images finish loading.'
const FALLBACK_EXPORT_ALL_ERROR =
  'Export All failed. Try again after images finish loading.'
const FALLBACK_CLIPBOARD_ERROR = 'Failed to copy to clipboard.'

// status of an in-flight export — UI uses this for spinners & disabled states.
// 'render' covers preview & annotate flows that produce a data URL but don't
// download a file
export type ExportStatus = ImageFormat | 'pdf' | 'clipboard' | 'render' | null

const getExportBackgroundColor = () =>
{
  const { exportBackgroundOverride, themeId } = usePreferencesStore.getState()
  return exportBackgroundOverride ?? THEMES[themeId]['export-bg']
}

const getCurrentExportAppearance = () =>
  getExportAppearance(usePreferencesStore.getState())

export const useExportController = () =>
{
  const [exportStatus, setExportStatus] = useState<ExportStatus>(null)
  const [exportAllProgress, setExportAllProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  // mirror state into refs so async callbacks read the latest value w/o
  // becoming dependencies — the effect runs after render, never during it
  const exportStatusRef = useRef(exportStatus)
  const exportAllProgressRef = useRef(exportAllProgress)
  useEffect(() =>
  {
    exportStatusRef.current = exportStatus
  }, [exportStatus])
  useEffect(() =>
  {
    exportAllProgressRef.current = exportAllProgress
  }, [exportAllProgress])

  // run an export action under the busy lock w/ consistent error handling.
  // returns undefined if the lock was already held or the action threw —
  // callers can use the truthy/falsy result to gate follow-up UI work
  const guardExport = useCallback(
    async <T>(
      status: Exclude<ExportStatus, null>,
      fallbackMessage: string,
      action: () => Promise<T>
    ): Promise<T | undefined> =>
    {
      if (exportStatusRef.current) return undefined

      useActiveBoardStore.getState().clearRuntimeError()
      setExportStatus(status)

      try
      {
        return await action()
      }
      catch (err)
      {
        // log so the original stack survives; surface a user-facing message
        // — formatError unwraps Error.message which is more informative than
        // a static fallback when the underlying export pipeline gave one
        console.error('[export]', err)
        useActiveBoardStore
          .getState()
          .setRuntimeError(formatError(err, fallbackMessage))
        return undefined
      }
      finally
      {
        setExportStatus(null)
      }
    },
    []
  )

  // render the active board to a PNG data URL via a hidden export session —
  // shared between preview & annotate flows
  const renderBoardToDataUrl = useCallback(async (): Promise<string | null> =>
  {
    const result = await guardExport(
      'render',
      FALLBACK_EXPORT_ERROR,
      async () =>
      {
        const bgColor = getExportBackgroundColor()
        const appearance = getCurrentExportAppearance()
        const data = extractBoardData(useActiveBoardStore.getState())

        return await withExportSession(
          { appearance, backgroundColor: bgColor },
          async (session) =>
          {
            const element = await session.renderBoard(data)
            return renderToDataUrl(element, 'png', bgColor)
          }
        )
      }
    )
    return result ?? null
  }, [guardExport])

  const runExport = useCallback(
    (type: ImageFormat | 'pdf') =>
      guardExport(type, FALLBACK_EXPORT_ERROR, async () =>
      {
        const bgColor = getExportBackgroundColor()
        const appearance = getCurrentExportAppearance()
        const data = extractBoardData(useActiveBoardStore.getState())
        const title = useActiveBoardStore.getState().title

        if (type === 'pdf')
        {
          await exportTierListAsPdf(data, title, appearance, bgColor)
        }
        else
        {
          await exportTierListAsImage(data, title, appearance, type, bgColor)
        }
      }),
    [guardExport]
  )

  const runCopyToClipboard = useCallback(async () =>
  {
    const ok = await guardExport(
      'clipboard',
      FALLBACK_CLIPBOARD_ERROR,
      async () =>
      {
        const bgColor = getExportBackgroundColor()
        const appearance = getCurrentExportAppearance()
        const data = extractBoardData(useActiveBoardStore.getState())
        await copyBoardToClipboard(data, appearance, bgColor)
        return true
      }
    )
    if (ok) toast('Copied to clipboard', 'success')
  }, [guardExport])

  // export-all is gated by both exportStatus & its own progress flag, so
  // it can't share guardExport directly without either weakening that
  // contract or adding a second status value. inline its lock instead
  const runExportAll = useCallback(
    async (type: 'json' | 'pdf' | ImageFormat) =>
    {
      if (exportStatusRef.current || exportAllProgressRef.current) return

      useActiveBoardStore.getState().clearRuntimeError()

      if (type === 'json')
      {
        try
        {
          await exportAllBoardsAsJson()
        }
        catch (err)
        {
          console.error('[export]', err)
          useActiveBoardStore
            .getState()
            .setRuntimeError(formatError(err, FALLBACK_EXPORT_ALL_ERROR))
        }
        return
      }

      const bgColor = getExportBackgroundColor()
      const appearance = getCurrentExportAppearance()
      const onProgress = (current: number, total: number) =>
        setExportAllProgress({ current, total })

      setExportAllProgress({ current: 0, total: 1 })

      try
      {
        if (type === 'pdf')
        {
          await exportAllBoardsAsPdf(appearance, bgColor, onProgress)
        }
        else
        {
          await exportAllBoardsAsImages(appearance, type, bgColor, onProgress)
        }
      }
      catch (err)
      {
        console.error('[export]', err)
        useActiveBoardStore
          .getState()
          .setRuntimeError(formatError(err, FALLBACK_EXPORT_ALL_ERROR))
      }
      finally
      {
        setExportAllProgress(null)
      }
    },
    []
  )

  return {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
    renderBoardToDataUrl,
  }
}
