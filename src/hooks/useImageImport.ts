// src/hooks/useImageImport.ts
// shared image upload logic — drag state, file processing, & error feedback

import { useCallback, useRef, useState } from 'react'

import { useTierListStore } from '../store/useTierListStore'
import { processImageFiles } from '../utils/imageResize'

interface UseImageImportReturn
{
  inputRef: React.RefObject<HTMLInputElement | null>
  isDraggingFiles: boolean
  isProcessing: boolean
  openFilePicker: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export const useImageImport = (): UseImageImportReturn =>
{
  const addItems = useTierListStore((s) => s.addItems)
  const clearRuntimeError = useTierListStore((s) => s.clearRuntimeError)
  const setRuntimeError = useTierListStore((s) => s.setRuntimeError)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // process a FileList or File array — filter, resize, & dispatch to store
  const handleFiles = useCallback(
    async (incoming: FileList | File[]) =>
    {
      const files = Array.from(incoming)
      if (files.length === 0) return

      clearRuntimeError()
      setIsProcessing(true)

      try
      {
        const imageCount = files.filter((f) =>
          f.type.startsWith('image/')
        ).length
        const skippedCount = files.length - imageCount

        if (imageCount === 0)
        {
          setRuntimeError(
            'No image files were found. Please upload PNG, JPG, WEBP, or GIF files.'
          )
          return
        }

        const newItems = await processImageFiles(files)
        if (newItems.length > 0) addItems(newItems)

        if (skippedCount > 0)
        {
          setRuntimeError(
            `Skipped ${skippedCount} non-image file${skippedCount > 1 ? 's' : ''}.`
          )
        }
      }
      finally
      {
        setIsProcessing(false)
        setIsDraggingFiles(false)
      }
    },
    [addItems, clearRuntimeError, setRuntimeError]
  )

  const openFilePicker = useCallback(() =>
  {
    inputRef.current?.click()
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) =>
  {
    e.preventDefault()
    setIsDraggingFiles(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) =>
  {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
    {
      setIsDraggingFiles(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) =>
    {
      e.preventDefault()
      void handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
    {
      if (e.target.files) void handleFiles(e.target.files)
      e.target.value = ''
    },
    [handleFiles]
  )

  return {
    inputRef,
    isDraggingFiles,
    isProcessing,
    openFilePicker,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileInputChange,
  }
}
