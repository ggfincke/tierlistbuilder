// src/shared/overlay/useModalDialog.ts
// shared modal behavior stack for focus trap, inert background, & Escape dismissal

import { useEffect, type RefObject } from 'react'

import { useFocusTrap } from './useFocusTrap'
import { useModalBackgroundInert } from './useModalBackgroundInert'

interface UseModalDialogOptions
{
  open: boolean
  dialogRef: RefObject<HTMLElement | null>
  onClose?: () => void
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

    const token = Symbol('modal-dialog')
    const canDismissOnEscape = Boolean(onClose) && closeOnEscape

    ACTIVE_MODAL_DIALOGS.push(token)

    if (!canDismissOnEscape)
    {
      return () =>
      {
        const dialogIndex = ACTIVE_MODAL_DIALOGS.indexOf(token)

        if (dialogIndex >= 0)
        {
          ACTIVE_MODAL_DIALOGS.splice(dialogIndex, 1)
        }
      }
    }

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

      onClose?.()
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
  }, [open, onClose, closeOnEscape, escapePhase, stopEscapePropagation])
}
