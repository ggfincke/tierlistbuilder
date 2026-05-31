// src/shared/overlay/modalDialog.ts
// modal dialog wiring for focus, inert background, & Escape dismissal

import { useEffect, type RefObject } from 'react'

import { useFocusTrap } from '~/shared/overlay/focusTrap'
import { createLayerStack } from '~/shared/overlay/layerStack'
import { useModalBackgroundInert } from '~/shared/overlay/modalLayer'

interface UseModalDialogOptions
{
  open: boolean
  dialogRef: RefObject<HTMLElement | null>
  onClose?: () => void
  onDismissAttempt?: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  restoreFocus?: boolean
  closeOnEscape?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
}

const ACTIVE_MODAL_DIALOGS = createLayerStack<symbol>()

const getTopmostModalDialog = (): symbol | undefined =>
  ACTIVE_MODAL_DIALOGS.top()

export const useModalDialog = ({
  open,
  dialogRef,
  onClose,
  onDismissAttempt,
  initialFocusRef,
  restoreFocus = true,
  closeOnEscape = true,
  escapePhase = 'bubble',
  stopEscapePropagation = true,
}: UseModalDialogOptions) =>
{
  useFocusTrap(dialogRef, {
    active: open,
    initialFocusRef,
    restoreFocus,
  })
  useModalBackgroundInert(open)

  useEffect(() =>
  {
    if (!open)
    {
      return
    }

    const escapeShouldClose = Boolean(onClose) && closeOnEscape
    const hasEscapeHandler = escapeShouldClose || Boolean(onDismissAttempt)

    if (!hasEscapeHandler)
    {
      return
    }

    const token = Symbol('modal-dialog')
    ACTIVE_MODAL_DIALOGS.push(token)

    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (event.defaultPrevented || event.key !== 'Escape')
      {
        return
      }

      if (getTopmostModalDialog() !== token)
      {
        return
      }

      if (stopEscapePropagation)
      {
        event.stopPropagation()
      }

      if (escapeShouldClose)
      {
        onClose?.()
      }
      else
      {
        onDismissAttempt?.()
      }
    }

    document.addEventListener(
      'keydown',
      handleKeyDown,
      escapePhase === 'capture'
    )

    return () =>
    {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
        escapePhase === 'capture'
      )

      ACTIVE_MODAL_DIALOGS.remove((entry) => entry === token)
    }
  }, [
    open,
    onClose,
    onDismissAttempt,
    closeOnEscape,
    escapePhase,
    stopEscapePropagation,
  ])
}
