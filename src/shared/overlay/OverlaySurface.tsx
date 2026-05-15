// src/shared/overlay/OverlaySurface.tsx
// reusable surfaces for menus, panels, fixed popups, & menu rows

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

import { joinClassNames } from '~/shared/lib/className'
import {
  overlayMenuItemClass,
  type OverlayMenuItemDensity,
} from './menuItemClass'

interface OverlaySurfaceProps extends HTMLAttributes<HTMLDivElement>
{
  style?: CSSProperties
}

export const OverlayMenuSurface = forwardRef<
  HTMLDivElement,
  OverlaySurfaceProps
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={joinClassNames(
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
    className={joinClassNames(
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
    className={joinClassNames(
      'rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] shadow-lg',
      className
    )}
  />
))

OverlayFixedPopupSurface.displayName = 'OverlayFixedPopupSurface'

interface OverlayMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement>
{
  children: ReactNode
  density?: OverlayMenuItemDensity
}

export const OverlayMenuItem = ({
  children,
  className,
  density = 'default',
  type = 'button',
  ...props
}: OverlayMenuItemProps) => (
  <button
    type={type}
    {...props}
    className={overlayMenuItemClass(density, className ?? undefined)}
  >
    {children}
  </button>
)

export const OverlayDivider = ({ className }: { className?: string }) => (
  <div
    className={joinClassNames(
      'my-1 border-t border-[var(--t-border)]',
      className
    )}
  />
)
