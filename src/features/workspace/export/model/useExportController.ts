// src/features/workspace/export/model/useExportController.ts
// export controller hook — board export commands, progress, & runtime error handling

import { useCallback, useRef, useState } from 'react'

import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { extractBoardData } from '@/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { THEMES } from '@/shared/theme/tokens'
import type { ImageFormat } from '@/shared/types/export'
import { toast } from '@/shared/notifications/useToastStore'
import {
  exportAllBoardsAsImages,
  exportAllBoardsAsJson,
  exportAllBoardsAsPdf,
} from '@/features/workspace/export/lib/exportAll'
import {
  copyBoardToClipboard,
  exportTierListAsImage,
  renderToDataUrl,
} from '@/features/workspace/export/lib/exportImage'
import {
  getExportAppearance,
  withExportSession,
} from '@/features/workspace/export/lib/exportBoardRender'
import { exportTierListAsPdf } from '@/features/workspace/export/lib/exportPdf'

const getExportBackgroundColor = () =>
{
  const { exportBackgroundOverride, themeId } = useSettingsStore.getState()
  return exportBackgroundOverride ?? THEMES[themeId]['export-bg']
}

const getCurrentExportAppearance = () =>
  getExportAppearance(useSettingsStore.getState())

export const useExportController = () =>
{
  const [exportStatus, setExportStatus] = useState<
    ImageFormat | 'pdf' | 'clipboard' | null
  >(null)
  const [exportAllProgress, setExportAllProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  // use refs for guard checks so callbacks stay stable across renders
  const exportStatusRef = useRef(exportStatus)
  exportStatusRef.current = exportStatus
  const exportAllProgressRef = useRef(exportAllProgress)
  exportAllProgressRef.current = exportAllProgress

  const runExport = useCallback(async (type: ImageFormat | 'pdf') =>
  {
    if (exportStatusRef.current) return

    useActiveBoardStore.getState().clearRuntimeError()
    setExportStatus(type)

    try
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
    }
    catch
    {
      useActiveBoardStore
        .getState()
        .setRuntimeError(
          'Export failed. Try again after images finish loading.'
        )
    }
    finally
    {
      setExportStatus(null)
    }
  }, [])

  const runCopyToClipboard = useCallback(async () =>
  {
    if (exportStatusRef.current) return

    useActiveBoardStore.getState().clearRuntimeError()
    setExportStatus('clipboard')

    try
    {
      const bgColor = getExportBackgroundColor()
      const appearance = getCurrentExportAppearance()
      const data = extractBoardData(useActiveBoardStore.getState())
      await copyBoardToClipboard(data, appearance, bgColor)
      toast('Copied to clipboard', 'success')
    }
    catch (err)
    {
      useActiveBoardStore
        .getState()
        .setRuntimeError(
          err instanceof Error ? err.message : 'Failed to copy to clipboard.'
        )
    }
    finally
    {
      setExportStatus(null)
    }
  }, [])

  const runExportAll = useCallback(
    async (type: 'json' | 'pdf' | ImageFormat) =>
    {
      if (exportStatusRef.current || exportAllProgressRef.current) return

      useActiveBoardStore.getState().clearRuntimeError()

      if (type === 'json')
      {
        try
        {
          exportAllBoardsAsJson()
        }
        catch
        {
          useActiveBoardStore
            .getState()
            .setRuntimeError('Export All failed. Try again.')
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
      catch
      {
        useActiveBoardStore
          .getState()
          .setRuntimeError(
            'Export All failed. Try again after images finish loading.'
          )
      }
      finally
      {
        setExportAllProgress(null)
      }
    },
    []
  )

  // render the board to a data URL for annotation (does not download)
  const runAnnotatedExport = useCallback(async (): Promise<string | null> =>
  {
    if (exportStatusRef.current) return null

    useActiveBoardStore.getState().clearRuntimeError()
    setExportStatus('png')

    try
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
    catch
    {
      useActiveBoardStore
        .getState()
        .setRuntimeError(
          'Export failed. Try again after images finish loading.'
        )
      return null
    }
    finally
    {
      setExportStatus(null)
    }
  }, [])

  // render board to a data URL for preview (does not download)
  const runPreviewRender = useCallback(async (): Promise<string | null> =>
  {
    if (exportStatusRef.current) return null

    useActiveBoardStore.getState().clearRuntimeError()
    setExportStatus('png')

    try
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
    catch
    {
      useActiveBoardStore
        .getState()
        .setRuntimeError(
          'Export failed. Try again after images finish loading.'
        )
      return null
    }
    finally
    {
      setExportStatus(null)
    }
  }, [])

  return {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
    runAnnotatedExport,
    runPreviewRender,
  }
}
