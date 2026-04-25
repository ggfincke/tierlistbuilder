// src/shared/ui/ActionButton.tsx
// action icon button requiring an accessible label & tooltip title

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { Button } from '~/shared/ui/Button'

interface ActionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'aria-haspopup'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-label'
  | 'title'
  | 'type'
  | 'children'
>
{
  label: string
  title: string
  children: ReactNode
  hasPopup?: 'dialog' | 'menu'
  expanded?: boolean
  controlsId?: string
  active?: boolean
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      label,
      title,
      children,
      hasPopup,
      expanded,
      controlsId,
      active = false,
      ...rest
    },
    ref
  ) => (
    <Button
      ref={ref}
      variant="action"
      active={active}
      aria-label={label}
      title={title}
      aria-haspopup={hasPopup}
      aria-controls={controlsId}
      aria-expanded={hasPopup ? expanded : undefined}
      {...rest}
    >
      {children}
    </Button>
  )
)

ActionButton.displayName = 'ActionButton'
