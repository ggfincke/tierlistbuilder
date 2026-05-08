// src/shared/ui/ActionButton.tsx
// action icon button requiring an accessible label & tooltip title

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { ChevronDown } from 'lucide-react'

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
  // when true, render a small chevron-down badge in the lower-right corner so
  // the icon button reads as a dropdown trigger rather than a single action
  withDropdownIndicator?: boolean
  ref?: Ref<HTMLButtonElement>
}

export const ActionButton = ({
  label,
  title,
  children,
  hasPopup,
  expanded,
  controlsId,
  active = false,
  withDropdownIndicator = false,
  ref,
  ...rest
}: ActionButtonProps) => (
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
    {withDropdownIndicator ? (
      <span className="relative inline-flex items-center justify-center">
        {children}
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute -bottom-2 -right-2 h-3 w-3 text-[var(--t-text-faint)]"
          strokeWidth={2.2}
        />
      </span>
    ) : (
      children
    )}
  </Button>
)
