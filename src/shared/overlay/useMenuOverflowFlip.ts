// src/shared/overlay/useMenuOverflowFlip.ts
// flips a submenu to the opposite horizontal side when it overflows the viewport

import { useCallback, useRef } from 'react'
import {
  MENU_SUBMENU_FLIP_LEFT_TOKENS,
  MENU_SUBMENU_FLIP_RIGHT_TOKENS,
} from './menuClasses'

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

  const rect = node.getBoundingClientRect()

  if (rect.right > viewportWidth)
  {
    node.classList.add(...MENU_SUBMENU_FLIP_LEFT_TOKENS)
    return
  }

  if (rect.left < 0)
  {
    node.classList.add(...MENU_SUBMENU_FLIP_RIGHT_TOKENS)
  }
}

export const useMenuOverflowFlip = () =>
{
  // callback ref — measures on mount & applies flip imperatively
  const ref = useCallback((node: HTMLDivElement | null) =>
  {
    applyMenuOverflowFlip(node, window.innerWidth)
  }, [])

  return { ref }
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
