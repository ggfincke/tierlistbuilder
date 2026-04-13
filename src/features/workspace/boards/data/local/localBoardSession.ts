// src/features/workspace/boards/data/local/localBoardSession.ts
// board session service — bootstrap, autosave, storage I/O, & registry orchestration

import type {
  BoardMeta,
  BoardSnapshot,
} from '@/features/workspace/boards/model/contract'
import type { TierPreset } from '@/features/workspace/tier-presets/model/contract'
import type { BoardId } from '@/shared/types/ids'
import type { PaletteId } from '@/shared/types/theme'
import { DEFAULT_TITLE } from '@/features/workspace/boards/lib/boardDefaults'
import { generateBoardId } from '@/shared/lib/id'
import { migrateLegacyBoard } from './boardMigration'
import {
  loadBoardFromStorage,
  removeBoardFromStorage,
  saveBoardToStorage,
  type BoardLoadResult,
} from './boardStorage'
import { isStorageNearFull } from '@/shared/lib/storageMetering'
import { toast } from '@/shared/notifications/useToastStore'
import { normalizeBoardSnapshot } from '@/features/workspace/boards/model/boardSnapshot'
import {
  BUILTIN_PRESETS,
  createBoardDataFromPreset,
} from '@/features/workspace/tier-presets/model/tierPresets'
import { useWorkspaceBoardRegistryStore } from '@/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { extractBoardData } from '@/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'

const PERSISTED_FIELDS = [
  'title',
  'tiers',
  'unrankedItemIds',
  'items',
  'deletedItems',
] as const

let saveTimeout: ReturnType<typeof setTimeout> | null = null
let autosaveUnsubscribe: (() => void) | null = null
// timestamp of last near-full warning — rate-limits the toast to once per 60s
let storageWarningLastMs = 0
const STORAGE_WARNING_COOLDOWN_MS = 60_000

const getActivePaletteId = (): PaletteId =>
  useSettingsStore.getState().paletteId

const createBoardMeta = (id: BoardId, title: string): BoardMeta => ({
  id,
  title,
  createdAt: Date.now(),
})

const deduplicateTitle = (title: string, boards: BoardMeta[]): string =>
{
  const base = title.replace(/ \(\d+\)$/, '')
  const existing = new Set(boards.map((board) => board.title))

  if (!existing.has(base))
  {
    return base
  }

  let n = 2

  while (existing.has(`${base} (${n})`))
  {
    n++
  }

  return `${base} (${n})`
}

export const saveBoardSnapshot = (boardId: BoardId): void =>
{
  const data = extractBoardData(useActiveBoardStore.getState())
  saveBoardToStorage(boardId, data, (message) =>
    useActiveBoardStore.getState().setRuntimeError(message)
  )

  // proactive warning when storage is near full (rate-limited);
  // skip the full localStorage scan when within the cooldown window
  const now = Date.now()
  if (
    now - storageWarningLastMs > STORAGE_WARNING_COOLDOWN_MS &&
    isStorageNearFull()
  )
  {
    storageWarningLastMs = now
    toast(
      'Storage is almost full. Delete unused boards or remove large images to free space.',
      'error'
    )
  }
}

export const saveActiveBoardSnapshot = (): void =>
{
  const { activeBoardId } = useWorkspaceBoardRegistryStore.getState()

  if (activeBoardId)
  {
    saveBoardSnapshot(activeBoardId)
  }
}

// normalize a BoardLoadResult into a BoardSnapshot, surfacing a corrupted
// toast when the load failed; lets callers reuse a result they already have
const snapshotFromResult = (result: BoardLoadResult): BoardSnapshot =>
{
  if (result.status === 'corrupted')
  {
    toast('Board data was corrupted and has been reset.', 'error')
  }

  return normalizeBoardSnapshot(
    result.status === 'ok' ? result.data : null,
    getActivePaletteId()
  )
}

export const loadPersistedBoard = (boardId: BoardId): BoardSnapshot =>
  snapshotFromResult(loadBoardFromStorage(boardId))

export const loadBoardIntoSession = (boardId: BoardId): BoardSnapshot =>
{
  const data = loadPersistedBoard(boardId)
  useActiveBoardStore.getState().loadBoard(data)
  return data
}

const createBlankBoardData = (): BoardSnapshot => ({
  title: DEFAULT_TITLE,
  tiers: [],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

const saveAndActivateBoard = (
  data: BoardSnapshot,
  titleHint: string
): BoardId =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const id = generateBoardId()
  const title = deduplicateTitle(titleHint, boardStore.boards)
  const normalized = normalizeBoardSnapshot(
    { ...data, title },
    getActivePaletteId(),
    title
  )

  saveBoardToStorage(id, normalized)
  useWorkspaceBoardRegistryStore
    .getState()
    .addBoardMeta(createBoardMeta(id, title), true)
  useActiveBoardStore.getState().loadBoard(normalized)
  return id
}

interface PruneResult
{
  healthy: BoardMeta[]
  // cached load results keyed by board ID — reused on bootstrap to skip a
  // second parse pass for the active board's payload
  results: Map<BoardId, BoardLoadResult>
}

// read each registry entry once, drop any that fail to parse, & retain the
// parsed payloads so bootstrap can hand the active board straight into the
// active store without re-reading localStorage
const pruneOrphanedRegistryEntries = (): PruneResult =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const healthy: BoardMeta[] = []
  const results = new Map<BoardId, BoardLoadResult>()
  let pruned = 0

  for (const meta of boardStore.boards)
  {
    const result = loadBoardFromStorage(meta.id)

    if (result.status !== 'ok')
    {
      removeBoardFromStorage(meta.id)
      pruned++
      continue
    }

    healthy.push(meta)
    results.set(meta.id, result)
  }

  if (pruned > 0)
  {
    toast(
      `${pruned} board${pruned > 1 ? 's' : ''} had corrupted data and ${pruned > 1 ? 'were' : 'was'} removed.`,
      'error'
    )
  }

  return { healthy, results }
}

export const bootstrapBoardSession = (): void =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  // prune registry entries whose localStorage data is missing or corrupted
  const { healthy: healthyBoards, results } = pruneOrphanedRegistryEntries()
  const nextActiveId =
    (healthyBoards.some((b) => b.id === boardStore.activeBoardId)
      ? boardStore.activeBoardId
      : healthyBoards[0]?.id) || ''

  if (healthyBoards.length > 0 && nextActiveId)
  {
    // update registry if any boards were pruned
    if (
      healthyBoards.length !== boardStore.boards.length ||
      boardStore.activeBoardId !== nextActiveId
    )
    {
      boardStore.replaceRegistry(healthyBoards, nextActiveId)
    }

    // reuse the payload captured during pruning instead of re-parsing it
    const cached = results.get(nextActiveId)
    const data = cached
      ? snapshotFromResult(cached)
      : loadPersistedBoard(nextActiveId)
    useActiveBoardStore.getState().loadBoard(data)
    return
  }

  const legacy = migrateLegacyBoard(DEFAULT_TITLE)

  if (legacy)
  {
    const data = normalizeBoardSnapshot(
      legacy.data as Partial<BoardSnapshot>,
      getActivePaletteId(),
      DEFAULT_TITLE
    )
    saveBoardToStorage(legacy.id, data)
    boardStore.replaceRegistry(
      [createBoardMeta(legacy.id, data.title)],
      legacy.id
    )
    useActiveBoardStore.getState().loadBoard(data)
    return
  }

  const id = generateBoardId()
  const classicPreset = BUILTIN_PRESETS.find((p) => p.id === 'builtin-classic')!
  const data = createBoardDataFromPreset(classicPreset)
  saveBoardToStorage(id, data)
  boardStore.replaceRegistry([createBoardMeta(id, data.title)], id)
  useActiveBoardStore.getState().loadBoard(data)
}

export const registerBoardAutosave = (): (() => void) =>
{
  if (autosaveUnsubscribe)
  {
    return autosaveUnsubscribe
  }

  const unsubscribe = useActiveBoardStore.subscribe((state, prevState) =>
  {
    if (PERSISTED_FIELDS.every((key) => state[key] === prevState[key]))
    {
      return
    }

    if (saveTimeout)
    {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() =>
    {
      saveActiveBoardSnapshot()
    }, 300)
  })

  autosaveUnsubscribe = () =>
  {
    if (saveTimeout)
    {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }

    unsubscribe()
    autosaveUnsubscribe = null
  }

  return autosaveUnsubscribe
}

export const createBoardSession = (): void =>
{
  saveActiveBoardSnapshot()
  saveAndActivateBoard(createBlankBoardData(), DEFAULT_TITLE)
}

export const createBoardSessionFromPreset = (preset: TierPreset): void =>
{
  saveActiveBoardSnapshot()
  const data = createBoardDataFromPreset(preset)
  saveAndActivateBoard(data, DEFAULT_TITLE)
}

export const switchBoardSession = (boardId: BoardId): void =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  if (boardId === boardStore.activeBoardId)
  {
    return
  }

  if (!boardStore.boards.some((board) => board.id === boardId))
  {
    return
  }

  useActiveBoardStore.getState().discardDragPreview()
  saveActiveBoardSnapshot()
  loadBoardIntoSession(boardId)
  boardStore.setActiveBoardId(boardId)
}

export const deleteBoardSession = (boardId: BoardId): void =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  if (boardStore.boards.length <= 1)
  {
    useActiveBoardStore
      .getState()
      .setRuntimeError('At least one list must remain.')
    return
  }

  removeBoardFromStorage(boardId)
  const nextBoards = boardStore.boards.filter((board) => board.id !== boardId)

  if (boardId === boardStore.activeBoardId)
  {
    const nextActiveId = nextBoards[0].id
    boardStore.replaceRegistry(nextBoards, nextActiveId)
    loadBoardIntoSession(nextActiveId)
    return
  }

  boardStore.removeBoardMeta(boardId)
}

export const duplicateBoardSession = (boardId: BoardId): void =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()

  if (!boardStore.boards.some((board) => board.id === boardId))
  {
    return
  }

  saveActiveBoardSnapshot()

  const source =
    boardId === boardStore.activeBoardId
      ? extractBoardData(useActiveBoardStore.getState())
      : loadPersistedBoard(boardId)

  saveAndActivateBoard(source, source.title || DEFAULT_TITLE)
}

export const renameBoardSession = (boardId: BoardId, title: string): void =>
{
  const trimmed = title.trim()

  if (!trimmed)
  {
    return
  }

  const boardStore = useWorkspaceBoardRegistryStore.getState()
  boardStore.renameBoardMeta(boardId, trimmed)

  if (boardId === boardStore.activeBoardId)
  {
    useActiveBoardStore.setState({ title: trimmed })
  }
}

export const importBoardSession = (data: BoardSnapshot): void =>
{
  saveActiveBoardSnapshot()
  saveAndActivateBoard(data, data.title || DEFAULT_TITLE)
}

export const importBoardsSession = (boards: BoardSnapshot[]): void =>
{
  if (boards.length === 0)
  {
    return
  }

  saveActiveBoardSnapshot()

  const boardStore = useWorkspaceBoardRegistryStore.getState()
  let nextBoards = boardStore.boards
  let lastId = boardStore.activeBoardId

  for (const board of boards)
  {
    const id = generateBoardId()
    const title = deduplicateTitle(board.title || DEFAULT_TITLE, nextBoards)
    const normalized = normalizeBoardSnapshot(
      { ...board, title },
      getActivePaletteId(),
      title
    )

    saveBoardToStorage(id, normalized)
    nextBoards = [...nextBoards, createBoardMeta(id, title)]
    lastId = id
  }

  if (!lastId)
  {
    return
  }

  useWorkspaceBoardRegistryStore.getState().replaceRegistry(nextBoards, lastId)
  loadBoardIntoSession(lastId)
}
