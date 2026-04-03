// src/components/ui/OverlayPrimitives.tsx
// shared overlay composition primitives for menus, panels, dividers, & fixed popups

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

interface OverlaySurfaceProps extends HTMLAttributes<HTMLDivElement>
{
  style?: CSSProperties
}

const mergeClassName = (baseClassName: string, className?: string): string =>
  className ? `${baseClassName} ${className}` : baseClassName

export const OverlayMenuSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={mergeClassName(
      'rounded-xl border border-[rgb(var(--t-overlay)/0.12)] bg-[var(--t-bg-overlay)] p-1.5 shadow-2xl',
      className
    )}
  />
))

OverlayMenuSurface.displayName = 'OverlayMenuSurface'

export const OverlayPanelSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={mergeClassName(
      'rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-overlay)] shadow-2xl',
      className
    )}
  />
))

OverlayPanelSurface.displayName = 'OverlayPanelSurface'

export const OverlayFixedPopupSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={mergeClassName(
      'rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] shadow-lg',
      className
    )}
  />
))

OverlayFixedPopupSurface.displayName = 'OverlayFixedPopupSurface'

interface OverlayMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  children: ReactNode
}

export const OverlayMenuItem = ({
  children,
  className,
  type = 'button',
  ...props
}: OverlayMenuItemProps) => (
  <button
    type={type}
    {...props}
    className={mergeClassName(
      'focus-custom flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[var(--t-text)] transition hover:bg-[rgb(var(--t-overlay)/0.06)] focus-visible:bg-[rgb(var(--t-overlay)/0.08)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)]',
      className
    )}
  >
    {children}
  </button>
)

export const OverlayDivider = ({ className }: { className?: string }) => (
  <div
    className={mergeClassName(
      'my-1 border-t border-[var(--t-border)]',
      className
    )}
  />
)
