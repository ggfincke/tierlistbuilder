// src/app/shells/workspace/useWorkspaceExportActions.ts
// workspace export commands that open preview & annotation modals. owns
// the shared image-format state used by both the menu picker & preview

import { useCallback, useMemo, useState } from 'react'

import type { ModalStackState, ModalStack } from '~/app/shells/useModalStack'
import type { WorkspaceModalPayloads } from '~/app/shells/workspace/workspaceModals'
import type { ImageFormat } from '~/features/workspace/export/model/runtime'
import { useExportController } from '~/features/workspace/export/model/useExportController'

type RenderThenOpenModal = 'annotation' | 'preview'

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
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const {
    exportStatus,
    exportAllProgress,
    runExport,
    runCopyToClipboard,
    runExportAll,
    renderBoardToDataUrl,
  } = useExportController()

  const makeRenderThenOpen = useCallback(
    (key: RenderThenOpenModal) => () =>
    {
      void renderBoardToDataUrl().then((image) =>
      {
        if (image)
        {
          openModal(key, image)
        }
      })
    },
    [openModal, renderBoardToDataUrl]
  )

  const handleAnnotateExport = useMemo(
    () => makeRenderThenOpen('annotation'),
    [makeRenderThenOpen]
  )

  const handlePreviewExport = useMemo(
    () => makeRenderThenOpen('preview'),
    [makeRenderThenOpen]
  )

  const handlePreviewDownload = useCallback(() =>
  {
    void runExport(imageFormat)
    closeModal('preview')
  }, [closeModal, runExport, imageFormat])

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
    imageFormat,
    setImageFormat,
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
