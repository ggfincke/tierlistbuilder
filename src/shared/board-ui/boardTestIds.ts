// src/shared/board-ui/boardTestIds.ts
// shared data-testid values & matching querySelector builders for board DOM.
// centralized so emit sites & reader sites can't drift apart

// static testids — stable across renders
export const TIER_LIST_BOARD_TEST_ID = 'tier-list-board'
export const UNRANKED_CONTAINER_TEST_ID = 'unranked-container'
export const EXPORT_BOARD_ROOT_TEST_ID = 'export-board-root'

// dynamic testid builders — append an entity id
export const tierContainerTestId = (tierId: string): string =>
  `tier-container-${tierId}`
export const tierItemTestId = (itemId: string): string => `tier-item-${itemId}`

// matching querySelector strings
export const TIER_LIST_BOARD_SELECTOR = `[data-testid="${TIER_LIST_BOARD_TEST_ID}"]`
export const UNRANKED_CONTAINER_SELECTOR = `[data-testid="${UNRANKED_CONTAINER_TEST_ID}"]`
export const EXPORT_BOARD_ROOT_SELECTOR = `[data-testid="${EXPORT_BOARD_ROOT_TEST_ID}"]`

export const tierContainerSelector = (tierId: string): string =>
  `[data-testid="${tierContainerTestId(tierId)}"]`
export const tierItemSelector = (itemId: string): string =>
  `[data-testid="${tierItemTestId(itemId)}"]`

// data-bulk-action-bar marker — sibling of ITEM_DATA_ATTR for selection-preservation
// pointerdown checks in useGlobalShortcuts
export const BULK_ACTION_BAR_ATTR = 'data-bulk-action-bar'
export const BULK_ACTION_BAR_SELECTOR = `[${BULK_ACTION_BAR_ATTR}]`
