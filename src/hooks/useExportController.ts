// src/hooks/useExportController.ts
// export controller hook — board export commands, progress, & runtime error handling

import { useCallback, useRef, useState } from 'react'

import { useSettingsStore } from '../store/useSettingsStore'
import { extractBoardData } from '../domain/boardData'
import { useTierListStore } from '../store/useTierListStore'
import { THEMES } from '../theme/tokens'
import type { ImageFormat } from '../types'
import {
  exportAllBoardsAsImages,
  exportAllBoardsAsJson,
  exportAllBoardsAsPdf,
} from '../utils/exportAll'
import {
  copyBoardToClipboard,
  exportTierListAsImage,
  renderToDataUrl,
} from '../utils/exportImage'
import {
  getExportAppearance,
  withExportSession,
} from '../utils/exportBoardRender'
import { exportTierListAsPdf } from '../utils/exportPdf'

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

    useTierListStore.getState().clearRuntimeError()
    setExportStatus(type)

    try
    {
      const bgColor = getExportBackgroundColor()
      const appearance = getCurrentExportAppearance()
      const data = extractBoardData(useTierListStore.getState())
      const title = useTierListStore.getState().title

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
      useTierListStore
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

    useTierListStore.getState().clearRuntimeError()
    setExportStatus('clipboard')

    try
    {
      const bgColor = getExportBackgroundColor()
      const appearance = getCurrentExportAppearance()
      const data = extractBoardData(useTierListStore.getState())
      await copyBoardToClipboard(data, appearance, bgColor)
    }
    catch (err)
    {
      useTierListStore
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

      useTierListStore.getState().clearRuntimeError()

      if (type === 'json')
      {
        try
        {
          exportAllBoardsAsJson()
        }
        catch
        {
          useTierListStore
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
        useTierListStore
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

    useTierListStore.getState().clearRuntimeError()
    setExportStatus('png')

    try
    {
      const bgColor = getExportBackgroundColor()
      const appearance = getCurrentExportAppearance()
      const data = extractBoardData(useTierListStore.getState())

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
      useTierListStore
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
  }
}
