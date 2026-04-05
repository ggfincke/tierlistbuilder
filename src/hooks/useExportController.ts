// src/hooks/useExportController.ts
// export controller hook — board export commands, progress, & runtime error handling

import { useCallback, useState } from 'react'

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
} from '../utils/exportImage'
import { getExportAppearance } from '../utils/exportBoardRender'
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
  const clearRuntimeError = useTierListStore((state) => state.clearRuntimeError)
  const setRuntimeError = useTierListStore((state) => state.setRuntimeError)
  const title = useTierListStore((state) => state.title)
  const [exportStatus, setExportStatus] = useState<
    ImageFormat | 'pdf' | 'clipboard' | null
  >(null)
  const [exportAllProgress, setExportAllProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  const runExport = useCallback(
    async (type: ImageFormat | 'pdf') =>
    {
      if (exportStatus)
      {
        return
      }

      clearRuntimeError()
      setExportStatus(type)

      try
      {
        const bgColor = getExportBackgroundColor()
        const appearance = getCurrentExportAppearance()
        const data = extractBoardData(useTierListStore.getState())

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
        setRuntimeError('Export failed. Try again after images finish loading.')
      }
      finally
      {
        setExportStatus(null)
      }
    },
    [clearRuntimeError, exportStatus, setRuntimeError, title]
  )

  const runCopyToClipboard = useCallback(async () =>
  {
    if (exportStatus)
    {
      return
    }

    clearRuntimeError()
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
      setRuntimeError(
        err instanceof Error ? err.message : 'Failed to copy to clipboard.'
      )
    }
    finally
    {
      setExportStatus(null)
    }
  }, [clearRuntimeError, exportStatus, setRuntimeError])

  const runExportAll = useCallback(
    async (type: 'json' | 'pdf' | ImageFormat) =>
    {
      if (exportStatus || exportAllProgress)
      {
        return
      }

      clearRuntimeError()

      if (type === 'json')
      {
        try
        {
          exportAllBoardsAsJson()
        }
        catch
        {
          setRuntimeError('Export All failed. Try again.')
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
        setRuntimeError(
          'Export All failed. Try again after images finish loading.'
        )
      }
      finally
      {
        setExportAllProgress(null)
      }
    },
    [clearRuntimeError, exportAllProgress, exportStatus, setRuntimeError]
  )

  return {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
  }
}
