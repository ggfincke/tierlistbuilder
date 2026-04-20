// src/shared/overlay/menu.ts
// menu plumbing: dismissal, anchored popups, overflow flip, nested menu state, & submenu class tokens

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'

import { hasActiveModalLayer } from './useModal'

// submenu offset & bridge class tokens

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

// dismissible layer: outside-click / Escape / scroll-resize reposition

// shared empty array — avoids allocating a fresh array per render when callers
// omit `ignoreRefs`, which would otherwise force the effect to re-subscribe
const EMPTY_IGNORE_REFS: ReadonlyArray<RefObject<HTMLElement | null>> = []

interface UseDismissibleLayerOptions
{
  open: boolean
  layerRef?: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  ignoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>
  onDismiss: () => void
  closeOnEscape?: boolean
  closeOnInteractOutside?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
  onPositionUpdate?: () => void
}

export const useDismissibleLayer = ({
  open,
  layerRef,
  triggerRef,
  ignoreRefs = EMPTY_IGNORE_REFS,
  onDismiss,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  escapePhase = 'bubble',
  stopEscapePropagation = false,
  onPositionUpdate,
}: UseDismissibleLayerOptions) =>
{
  useEffect(() =>
  {
    if (!open)
    {
      return
    }

    const isInsideManagedElement = (target: Node): boolean =>
    {
      if (layerRef?.current?.contains(target))
      {
        return true
      }

      if (triggerRef?.current?.contains(target))
      {
        return true
      }

      return ignoreRefs.some((ref) => ref.current?.contains(target))
    }

    const isManagedInsideModal = (): boolean =>
    {
      const managedElements = [
        layerRef?.current,
        triggerRef?.current,
        ...ignoreRefs.map((ref) => ref.current),
      ]

      return managedElements.some((element) =>
        element?.closest('[aria-modal="true"]')
      )
    }

    const handlePointerDown = (event: PointerEvent) =>
    {
      if (hasActiveModalLayer() && !isManagedInsideModal())
      {
        return
      }

      if (!closeOnInteractOutside)
      {
        return
      }

      const target = event.target as Node | null

      if (!target || isInsideManagedElement(target))
      {
        return
      }

      onDismiss()
    }

    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (event.defaultPrevented)
      {
        return
      }

      if (hasActiveModalLayer() && !isManagedInsideModal())
      {
        return
      }

      if (!closeOnEscape || event.key !== 'Escape')
      {
        return
      }

      if (stopEscapePropagation)
      {
        event.stopPropagation()
      }

      onDismiss()
    }

    const handlePositionUpdate = () => onPositionUpdate?.()

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener(
      'keydown',
      handleKeyDown,
      escapePhase === 'capture'
    )

    if (onPositionUpdate)
    {
      window.addEventListener('scroll', handlePositionUpdate, true)
      window.addEventListener('resize', handlePositionUpdate)
    }

    return () =>
    {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener(
        'keydown',
        handleKeyDown,
        escapePhase === 'capture'
      )

      if (onPositionUpdate)
      {
        window.removeEventListener('scroll', handlePositionUpdate, true)
        window.removeEventListener('resize', handlePositionUpdate)
      }
    }
  }, [
    open,
    layerRef,
    triggerRef,
    ignoreRefs,
    onDismiss,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onPositionUpdate,
  ])
}

// anchored popup: fixed positioning + dismissal wired together

interface UseAnchoredPopupOptions
{
  open: boolean
  triggerRef?: RefObject<HTMLElement | null>
  popupRef: RefObject<HTMLElement | null>
  ignoreRefs?: ReadonlyArray<RefObject<HTMLElement | null>>
  onClose: () => void
  closeOnEscape?: boolean
  closeOnInteractOutside?: boolean
  escapePhase?: 'capture' | 'bubble'
  stopEscapePropagation?: boolean
  computePosition: () => CSSProperties | null
}

export const useAnchoredPopup = ({
  open,
  triggerRef,
  popupRef,
  ignoreRefs,
  onClose,
  closeOnEscape = true,
  closeOnInteractOutside = true,
  escapePhase = 'bubble',
  stopEscapePropagation = false,
  computePosition,
}: UseAnchoredPopupOptions) =>
{
  const [style, setStyle] = useState<CSSProperties>({})
  const computeRef = useRef(computePosition)

  useEffect(() =>
  {
    computeRef.current = computePosition
  }, [computePosition])

  const updatePosition = useCallback(() =>
  {
    const nextStyle = computeRef.current()

    if (nextStyle)
    {
      setStyle(nextStyle)
    }
  }, [])

  useDismissibleLayer({
    open,
    layerRef: popupRef,
    triggerRef,
    ignoreRefs,
    onDismiss: onClose,
    closeOnEscape,
    closeOnInteractOutside,
    escapePhase,
    stopEscapePropagation,
    onPositionUpdate: updatePosition,
  })

  useLayoutEffect(() =>
  {
    if (!open)
    {
      return
    }

    updatePosition()
  }, [open, updatePosition])

  return {
    style,
    updatePosition,
  }
}

// submenu overflow flip

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

// nested menu state

export interface NestedMenuDefinition<MenuId extends string>
{
  id: MenuId
  parentId?: MenuId
}

interface NestedMenuIndex<MenuId extends string>
{
  ids: readonly MenuId[]
  parentById: Map<MenuId, MenuId | null>
  childrenByParent: Map<MenuId | null, MenuId[]>
}

interface UseNestedMenusOptions<MenuId extends string>
{
  definitions: readonly NestedMenuDefinition<MenuId>[]
  disabledIds?: readonly MenuId[]
}

export const buildNestedMenuIndex = <MenuId extends string>(
  definitions: readonly NestedMenuDefinition<MenuId>[]
): NestedMenuIndex<MenuId> =>
{
  const ids = definitions.map((definition) => definition.id)
  const parentById = new Map<MenuId, MenuId | null>()
  const childrenByParent = new Map<MenuId | null, MenuId[]>()

  for (const definition of definitions)
  {
    const parentId = definition.parentId ?? null

    parentById.set(definition.id, parentId)

    if (!childrenByParent.has(parentId))
    {
      childrenByParent.set(parentId, [])
    }

    childrenByParent.get(parentId)?.push(definition.id)

    if (!childrenByParent.has(definition.id))
    {
      childrenByParent.set(definition.id, [])
    }
  }

  return {
    ids,
    parentById,
    childrenByParent,
  }
}

const getMenuPath = <MenuId extends string>(
  index: NestedMenuIndex<MenuId>,
  menuId: MenuId
): MenuId[] =>
{
  const path: MenuId[] = []
  let currentId: MenuId | null | undefined = menuId

  while (currentId)
  {
    path.unshift(currentId)
    currentId = index.parentById.get(currentId)
  }

  return path
}

const getMenuBranchSet = <MenuId extends string>(
  index: NestedMenuIndex<MenuId>,
  menuId: MenuId
): Set<MenuId> =>
{
  const branchIds = new Set<MenuId>()
  const pendingIds: MenuId[] = [menuId]

  while (pendingIds.length > 0)
  {
    const currentId = pendingIds.pop()

    if (!currentId || branchIds.has(currentId))
    {
      continue
    }

    branchIds.add(currentId)

    for (const childId of index.childrenByParent.get(currentId) ?? [])
    {
      pendingIds.push(childId)
    }
  }

  return branchIds
}

const normalizeMenuState = <MenuId extends string>(
  menuIds: Iterable<MenuId>,
  index: NestedMenuIndex<MenuId>
): MenuId[] =>
{
  const menuIdSet = new Set(menuIds)
  return index.ids.filter((menuId) => menuIdSet.has(menuId))
}

const isMenuDisabled = <MenuId extends string>(
  index: NestedMenuIndex<MenuId>,
  menuId: MenuId,
  disabledIds: ReadonlySet<MenuId>
): boolean =>
{
  for (const pathId of getMenuPath(index, menuId))
  {
    if (disabledIds.has(pathId))
    {
      return true
    }
  }

  return false
}

export const closeNestedMenuBranch = <MenuId extends string>(
  openMenuIds: readonly MenuId[],
  index: NestedMenuIndex<MenuId>,
  menuId: MenuId
): MenuId[] =>
{
  const branchIds = getMenuBranchSet(index, menuId)

  return normalizeMenuState(
    openMenuIds.filter((openMenuId) => !branchIds.has(openMenuId)),
    index
  )
}

const openNestedMenuPath = <MenuId extends string>(
  openMenuIds: readonly MenuId[],
  index: NestedMenuIndex<MenuId>,
  menuId: MenuId
): MenuId[] =>
{
  const nextOpenIds = new Set(openMenuIds)
  const pathIds = getMenuPath(index, menuId)

  for (const pathId of pathIds)
  {
    const parentId = index.parentById.get(pathId) ?? null

    for (const siblingId of index.childrenByParent.get(parentId) ?? [])
    {
      if (siblingId === pathId)
      {
        continue
      }

      for (const branchId of getMenuBranchSet(index, siblingId))
      {
        nextOpenIds.delete(branchId)
      }
    }

    nextOpenIds.add(pathId)
  }

  return normalizeMenuState(nextOpenIds, index)
}

export const pruneNestedMenuState = <MenuId extends string>(
  openMenuIds: readonly MenuId[],
  index: NestedMenuIndex<MenuId>,
  disabledIds: ReadonlySet<MenuId>
): MenuId[] =>
{
  if (disabledIds.size === 0)
  {
    return normalizeMenuState(openMenuIds, index)
  }

  const nextOpenIds = new Set(openMenuIds)

  for (const disabledId of disabledIds)
  {
    for (const branchId of getMenuBranchSet(index, disabledId))
    {
      nextOpenIds.delete(branchId)
    }
  }

  return normalizeMenuState(nextOpenIds, index)
}

export const toggleNestedMenuState = <MenuId extends string>(
  openMenuIds: readonly MenuId[],
  index: NestedMenuIndex<MenuId>,
  menuId: MenuId,
  disabledIds: ReadonlySet<MenuId>
): MenuId[] =>
{
  const prunedOpenIds = pruneNestedMenuState(openMenuIds, index, disabledIds)

  if (isMenuDisabled(index, menuId, disabledIds))
  {
    return prunedOpenIds
  }

  if (prunedOpenIds.includes(menuId))
  {
    return closeNestedMenuBranch(prunedOpenIds, index, menuId)
  }

  return openNestedMenuPath(prunedOpenIds, index, menuId)
}

export const useNestedMenus = <MenuId extends string>({
  definitions,
  disabledIds = [],
}: UseNestedMenusOptions<MenuId>) =>
{
  const index = useMemo(() => buildNestedMenuIndex(definitions), [definitions])
  const disabledIdSet = useMemo(
    () => new Set<MenuId>(disabledIds),
    [disabledIds]
  )
  const [openMenuIds, setOpenMenuIds] = useState<MenuId[]>([])

  // pure derivation — hides any menus currently disabled w/o writing to state;
  // visibility recomputes whenever the user toggles a menu or disabled set changes
  const visibleOpenMenuIds = useMemo(
    () => pruneNestedMenuState(openMenuIds, index, disabledIdSet),
    [disabledIdSet, index, openMenuIds]
  )
  const visibleOpenMenuIdSet = useMemo(
    () => new Set<MenuId>(visibleOpenMenuIds),
    [visibleOpenMenuIds]
  )

  const toggleMenu = useCallback(
    (menuId: MenuId) =>
    {
      setOpenMenuIds((currentOpenMenuIds) =>
        toggleNestedMenuState(currentOpenMenuIds, index, menuId, disabledIdSet)
      )
    },
    [disabledIdSet, index]
  )

  const closeMenu = useCallback(
    (menuId: MenuId) =>
    {
      setOpenMenuIds((currentOpenMenuIds) =>
        closeNestedMenuBranch(currentOpenMenuIds, index, menuId)
      )
    },
    [index]
  )

  const closeAllMenus = useCallback(() =>
  {
    setOpenMenuIds((current) => (current.length === 0 ? current : []))
  }, [])

  const isOpen = useCallback(
    (menuId: MenuId): boolean => visibleOpenMenuIdSet.has(menuId),
    [visibleOpenMenuIdSet]
  )

  return {
    isOpen,
    openMenuIds: visibleOpenMenuIds,
    toggleMenu,
    closeMenu,
    closeAllMenus,
  }
}
