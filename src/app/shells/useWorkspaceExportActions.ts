// src/app/shells/useWorkspaceExportActions.ts
// workspace export commands that open preview & annotation modals

import { useCallback, useState } from 'react'

import type { ModalStackState, ModalStack } from '~/app/shells/useModalStack'
import type { WorkspaceModalPayloads } from './workspaceModals'
import type { ImageFormat } from '~/features/workspace/export/model/runtime'
import { useExportController } from '~/features/workspace/export/model/useExportController'

interface UseWorkspaceExportActionsOptions
{
  modalState: ModalStackState<WorkspaceModalPayloads>
  openModal: ModalStack<WorkspaceModalPayloads>['open']
  closeModal: ModalStack<WorkspaceModalPayloads>['close']
}

export const useWorkspaceExportActions = ({
  modalState,
  openModal,
  closeModal,
}: UseWorkspaceExportActionsOptions) =>
{
  const [previewFormat, setPreviewFormat] = useState<ImageFormat>('png')
  const {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
    runAnnotatedExport,
    runPreviewRender,
  } = useExportController()

  const handleAnnotateExport = useCallback(() =>
  {
    void runAnnotatedExport().then((image) =>
    {
      if (image)
      {
        openModal('annotation', image)
      }
    })
  }, [openModal, runAnnotatedExport])

  const handlePreviewExport = useCallback(() =>
  {
    void runPreviewRender().then((image) =>
    {
      if (image)
      {
        openModal('preview', image)
      }
    })
  }, [openModal, runPreviewRender])

  const handlePreviewDownload = useCallback(() =>
  {
    void runExport(previewFormat)
    closeModal('preview')
  }, [closeModal, runExport, previewFormat])

  const handlePreviewCopy = useCallback(() =>
  {
    void runCopyToClipboard()
    closeModal('preview')
  }, [closeModal, runCopyToClipboard])

  const previewImage = modalState.preview?.payload

  const handlePreviewAnnotate = useCallback(() =>
  {
    closeModal('preview')
    if (previewImage)
    {
      openModal('annotation', previewImage)
    }
  }, [closeModal, openModal, previewImage])

  return {
    exportStatus,
    exportAllProgress,
    previewFormat,
    setPreviewFormat,
    runExport,
    runCopyToClipboard,
    runExportAll,
    handleAnnotateExport,
    handlePreviewExport,
    handlePreviewDownload,
    handlePreviewCopy,
    handlePreviewAnnotate,
  }
}
