// src/features/workspace/boards/lib/dndIds.ts
// stable drag-container IDs & DOM-attribute helpers shared across board DnD

// droppable container ID for the unranked pool
export const UNRANKED_CONTAINER_ID = 'unranked'

// droppable ID for the drag-to-trash zone
export const TRASH_CONTAINER_ID = 'trash'

// data-attribute name stamped on every rendered TierItem; the DnD hooks &
// shortcuts layer use it to resolve clicks -> item IDs without walking React
export const ITEM_DATA_ATTR = 'data-item-id'

// single rendered TierItem w/ the given item ID, or null if not in the DOM
export const getItemElementById = (itemId: string): HTMLElement | null =>
  document.querySelector(`[${ITEM_DATA_ATTR}="${itemId}"]`)

// selector for every rendered TierItem w/in a subtree — used for rAF batch
// measurements (drop-animation origin calc, rendered-snapshot rebuild)
export const ALL_ITEM_ELEMENTS_SELECTOR = `[${ITEM_DATA_ATTR}]`
