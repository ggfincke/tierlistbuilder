// src/utils/id.ts
// typed ID factories — centralized prefix conventions for all entity IDs

import type { BoardId, PresetId, TierId, UserPresetId } from '../types'

export const isBoardId = (value: string): value is BoardId =>
  value.startsWith('board-')

export const isTierId = (value: string): value is TierId =>
  value.startsWith('tier-')

export const isPresetId = (value: string): value is PresetId =>
  value.startsWith('preset-') || value.startsWith('builtin-')

export const generateBoardId = (): BoardId =>
  `board-${crypto.randomUUID()}` as BoardId

export const generateTierId = (): TierId =>
  `tier-${crypto.randomUUID()}` as TierId

export const generatePresetId = (): UserPresetId =>
  `preset-${crypto.randomUUID()}` as UserPresetId

export const generateItemId = (): string => crypto.randomUUID()
