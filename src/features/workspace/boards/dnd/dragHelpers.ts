// src/features/workspace/boards/dnd/dragHelpers.ts
// shared dnd-kit ID coercion used across drag hooks

import type { UniqueIdentifier } from '@dnd-kit/core'

import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'

// coerce a dnd-kit UniqueIdentifier to a string, returning null for numeric IDs
export const toStringId = (id: UniqueIdentifier): string | null =>
  typeof id === 'string' ? id : null

// coerce a dnd-kit UniqueIdentifier to an ItemId, returning null for numeric
// IDs. dnd-kit hands us bare strings from the DOM, so we trust the brand at
// the boundary when pulling item IDs out of drag events
export const toItemId = (id: UniqueIdentifier): ItemId | null =>
  typeof id === 'string' ? asItemId(id) : null
