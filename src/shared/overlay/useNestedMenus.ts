// src/shared/overlay/useNestedMenus.ts
// shared tree-aware state for nested click-open menus

import { useCallback, useEffect, useMemo, useState } from 'react'

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

const areMenuStatesEqual = <MenuId extends string>(
  left: readonly MenuId[],
  right: readonly MenuId[]
): boolean =>
{
  if (left.length !== right.length)
  {
    return false
  }

  return left.every((menuId, index) => menuId === right[index])
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

  const visibleOpenMenuIds = useMemo(
    () => pruneNestedMenuState(openMenuIds, index, disabledIdSet),
    [disabledIdSet, index, openMenuIds]
  )
  const visibleOpenMenuIdSet = useMemo(
    () => new Set<MenuId>(visibleOpenMenuIds),
    [visibleOpenMenuIds]
  )

  useEffect(() =>
  {
    if (areMenuStatesEqual(openMenuIds, visibleOpenMenuIds))
    {
      return
    }

    const syncTimer = window.setTimeout(() =>
    {
      setOpenMenuIds(visibleOpenMenuIds)
    }, 0)

    return () => window.clearTimeout(syncTimer)
  }, [openMenuIds, visibleOpenMenuIds])

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
        closeNestedMenuBranch(
          pruneNestedMenuState(currentOpenMenuIds, index, disabledIdSet),
          index,
          menuId
        )
      )
    },
    [disabledIdSet, index]
  )

  const closeAllMenus = useCallback(() =>
  {
    setOpenMenuIds([])
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
