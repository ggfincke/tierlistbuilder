// src/shared/lib/id.ts
// typed ID factories — centralized prefix conventions for all entity IDs

import type {
  BoardId,
  ItemId,
  TierId,
  UserPresetId,
} from '@tierlistbuilder/contracts/lib/ids'
import { asItemId } from '@tierlistbuilder/contracts/lib/ids'

export const isTierId = (value: string): value is TierId =>
  value.startsWith('tier-')

export const generateBoardId = (): BoardId =>
  `board-${crypto.randomUUID()}` as BoardId

export const generateTierId = (): TierId =>
  `tier-${crypto.randomUUID()}` as TierId

export const generatePresetId = (): UserPresetId =>
  `preset-${crypto.randomUUID()}` as UserPresetId

export const generateItemId = (): ItemId => asItemId(crypto.randomUUID())
