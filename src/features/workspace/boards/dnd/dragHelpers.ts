// src/features/workspace/boards/dnd/dragHelpers.ts
// shared dnd-kit ID coercion used across drag hooks

import type { UniqueIdentifier } from '@dnd-kit/core'

// coerce a dnd-kit UniqueIdentifier to string, returning null for numeric IDs
export const toStringId = (id: UniqueIdentifier): string | null =>
  typeof id === 'string' ? id : null
