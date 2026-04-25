// src/shared/overlay/menuOverflow.ts
// submenu offset tokens & viewport overflow flipping

import { useCallback, useRef } from 'react'

export const MENU_SUBMENU_RIGHT_OFFSET_CLASS = 'left-[calc(100%+0.375rem)]'
export const MENU_SUBMENU_LEFT_OFFSET_CLASS = 'right-[calc(100%+0.375rem)]'
export const MENU_SUBMENU_BRIDGE_TO_RIGHT_EDGE_CLASS = 'before:-left-2'
export const MENU_SUBMENU_BRIDGE_TO_LEFT_EDGE_CLASS = 'before:-right-2'
export const MENU_SUBMENU_BRIDGE_COMMON_TOKENS = [
  'before:top-0',
  'before:h-full',
  'before:w-2',
] as const

export const MENU_SUBMENU_FLIP_LEFT_TOKENS = [
  MENU_SUBMENU_LEFT_OFFSET_CLASS,
  'left-auto',
  MENU_SUBMENU_BRIDGE_TO_LEFT_EDGE_CLASS,
  'before:left-auto',
  ...MENU_SUBMENU_BRIDGE_COMMON_TOKENS,
] as const

export const MENU_SUBMENU_FLIP_RIGHT_TOKENS = [
  MENU_SUBMENU_RIGHT_OFFSET_CLASS,
  'right-auto',
  MENU_SUBMENU_BRIDGE_TO_RIGHT_EDGE_CLASS,
  'before:right-auto',
  ...MENU_SUBMENU_BRIDGE_COMMON_TOKENS,
] as const

export const resolveMenuOverflowFlipTokens = (
  rect: Pick<DOMRect, 'left' | 'right'>,
  viewportWidth: number
): readonly string[] =>
{
  if (rect.right > viewportWidth)
  {
    return MENU_SUBMENU_FLIP_LEFT_TOKENS
  }

  if (rect.left < 0)
  {
    return MENU_SUBMENU_FLIP_RIGHT_TOKENS
  }

  return []
}

const applyMenuOverflowFlip = (
  node: HTMLDivElement | null,
  viewportWidth: number
) =>
{
  if (!node)
  {
    return
  }

  const tokens = resolveMenuOverflowFlipTokens(
    node.getBoundingClientRect(),
    viewportWidth
  )

  if (tokens.length > 0)
  {
    node.classList.add(...tokens)
  }
}

export const useMenuOverflowFlipRefs = <MenuId extends string>() =>
{
  const refCache = useRef(
    new Map<MenuId, (node: HTMLDivElement | null) => void>()
  )

  const getRef = useCallback((menuId: MenuId) =>
  {
    const cachedRef = refCache.current.get(menuId)
    if (cachedRef)
    {
      return cachedRef
    }

    const nextRef = (node: HTMLDivElement | null) =>
      applyMenuOverflowFlip(node, window.innerWidth)

    refCache.current.set(menuId, nextRef)
    return nextRef
  }, [])

  return { getRef }
}
