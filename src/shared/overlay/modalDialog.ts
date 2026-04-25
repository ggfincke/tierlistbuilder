// src/shared/overlay/modalDialog.ts
// modal dialog wiring for focus, inert background, & Escape dismissal

import { useEffect, type RefObject } from 'react'

import { useFocusTrap } from './focusTrap'
import { useModalBackgroundInert } from './modalLayer'

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

const ACTIVE_MODAL_DIALOGS: symbol[] = []

const getTopmostModalDialog = (): symbol | undefined =>
  ACTIVE_MODAL_DIALOGS[ACTIVE_MODAL_DIALOGS.length - 1]

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

      const dialogIndex = ACTIVE_MODAL_DIALOGS.indexOf(token)

      if (dialogIndex >= 0)
      {
        ACTIVE_MODAL_DIALOGS.splice(dialogIndex, 1)
      }
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
