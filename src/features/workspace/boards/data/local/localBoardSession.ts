// src/features/workspace/boards/data/local/localBoardSession.ts
// board session service — bootstrap, autosave, storage I/O, & registry orchestration

import type {
  BoardMeta,
  BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { DEFAULT_TITLE } from '@/features/workspace/boards/lib/boardDefaults'
import { generateBoardId } from '@/shared/lib/id'
import {
  loadBoardFromStorage,
  removeBoardFromStorage,
  saveBoardToStorage,
  type BoardLoadResult,
} from './boardStorage'
import { warmFromBoard } from '@/shared/images/imageBlobCache'
import { migrateBoardImages } from '@/shared/images/boardImageMigration'
import { mapAsyncLimit } from '@/shared/lib/asyncMapLimit'
import {
  STORAGE_NEAR_FULL_MESSAGE,
  isStorageNearFull,
} from '@/shared/lib/storageMetering'
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
let suppressNextAutosave = false
// timestamp of last near-full warning — rate-limits the toast to once per 60s
let storageWarningLastMs = 0
const STORAGE_WARNING_COOLDOWN_MS = 60_000
const BOARD_IMPORT_CONCURRENCY = 3

const getActivePaletteId = (): PaletteId =>
  useSettingsStore.getState().paletteId

const createBoardMeta = (id: BoardId, title: string): BoardMeta => ({
  id,
  title,
  createdAt: Date.now(),
})

const clearPendingAutosave = (): void =>
{
  if (!saveTimeout)
  {
    return
  }

  clearTimeout(saveTimeout)
  saveTimeout = null
}

const loadBoardState = (snapshot: BoardSnapshot): void =>
{
  suppressNextAutosave = true
  useActiveBoardStore.getState().loadBoard(snapshot)
}

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
    toast(STORAGE_NEAR_FULL_MESSAGE, 'error')
  }
}

export const saveActiveBoardSnapshot = (): void =>
{
  clearPendingAutosave()

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

const prepareBoardForLoad = async (
  boardId: BoardId,
  snapshot: BoardSnapshot,
  options: {
    persistMigrated?: boolean
    warmCache?: boolean
  } = {}
): Promise<BoardSnapshot> =>
{
  const { persistMigrated = true, warmCache = true } = options
  const migrated = await migrateBoardImages(snapshot)

  if (persistMigrated && migrated !== snapshot)
  {
    saveBoardToStorage(boardId, migrated)
  }

  if (warmCache)
  {
    await warmFromBoard(migrated)
  }

  return migrated
}

export const loadBoardIntoSession = async (
  boardId: BoardId
): Promise<BoardSnapshot> =>
{
  const data = loadPersistedBoard(boardId)
  const prepared = await prepareBoardForLoad(boardId, data)
  loadBoardState(prepared)
  return prepared
}

const createBlankBoardData = (): BoardSnapshot => ({
  title: DEFAULT_TITLE,
  tiers: [],
  unrankedItemIds: [],
  items: {},
  deletedItems: [],
})

const saveAndActivateBoard = async (
  data: BoardSnapshot,
  titleHint: string
): Promise<BoardId> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const id = generateBoardId()
  const title = deduplicateTitle(titleHint, boardStore.boards)
  const normalized = normalizeBoardSnapshot(
    { ...data, title },
    getActivePaletteId(),
    title
  )

  const prepared = await prepareBoardForLoad(id, normalized, {
    persistMigrated: false,
  })
  saveBoardToStorage(id, prepared)
  useWorkspaceBoardRegistryStore
    .getState()
    .addBoardMeta(createBoardMeta(id, title), true)
  loadBoardState(prepared)
  return id
}

// schedule background work without blocking first paint; falls back to
// setTimeout in browsers w/o requestIdleCallback (Safari)
const scheduleIdle = (callback: () => void): void =>
{
  type IdleScheduler = (cb: () => void, opts?: { timeout: number }) => number
  const idleScheduler = (
    window as unknown as { requestIdleCallback?: IdleScheduler }
  ).requestIdleCallback

  if (idleScheduler)
  {
    idleScheduler(callback, { timeout: 2_000 })
  }
  else
  {
    setTimeout(callback, 0)
  }
}

// scan every registered board entry, dropping any that fail to parse;
// runs asynchronously after first paint so a slow scan doesn't block startup
const pruneOrphanedRegistryEntriesAsync = (
  skipBoardId: BoardId | null
): void =>
{
  scheduleIdle(() =>
  {
    const boardStore = useWorkspaceBoardRegistryStore.getState()
    const healthy: BoardMeta[] = []
    let pruned = 0

    for (const meta of boardStore.boards)
    {
      // active board is already loaded — assume it's healthy
      if (meta.id === skipBoardId)
      {
        healthy.push(meta)
        continue
      }

      const result = loadBoardFromStorage(meta.id)

      if (result.status !== 'ok')
      {
        removeBoardFromStorage(meta.id)
        pruned++
        continue
      }

      healthy.push(meta)
    }

    if (pruned > 0)
    {
      const nextActiveId =
        healthy.find((b) => b.id === boardStore.activeBoardId)?.id ??
        healthy[0]?.id ??
        ''
      boardStore.replaceRegistry(healthy, nextActiveId)
      toast(
        `${pruned} board${pruned > 1 ? 's' : ''} had corrupted data and ${pruned > 1 ? 'were' : 'was'} removed.`,
        'error'
      )
    }
  })
}

export const bootstrapBoardSession = async (): Promise<void> =>
{
  const boardStore = useWorkspaceBoardRegistryStore.getState()
  const requestedActiveId =
    boardStore.activeBoardId || boardStore.boards[0]?.id || ''

  if (requestedActiveId)
  {
    const result = loadBoardFromStorage(requestedActiveId)

    if (result.status === 'ok')
    {
      const data = snapshotFromResult(result)
      if (boardStore.activeBoardId !== requestedActiveId)
      {
        boardStore.setActiveBoardId(requestedActiveId)
      }
      const prepared = await prepareBoardForLoad(requestedActiveId, data)
      loadBoardState(prepared)
      pruneOrphanedRegistryEntriesAsync(requestedActiveId)
      return
    }

    // active board was corrupted — fall through to the fresh-board path
    removeBoardFromStorage(requestedActiveId)
    toast('Board data was corrupted and has been reset.', 'error')
  }

  const id = generateBoardId()
  const classicPreset = BUILTIN_PRESETS.find((p) => p.id === 'builtin-classic')!
  const data = createBoardDataFromPreset(classicPreset)
  saveBoardToStorage(id, data)
  boardStore.replaceRegistry([createBoardMeta(id, data.title)], id)
  await warmFromBoard(data)
  loadBoardState(data)
}

export const registerBoardAutosave = (): (() => void) =>
{
  if (autosaveUnsubscribe)
  {
    return autosaveUnsubscribe
  }

  const unsubscribe = useActiveBoardStore.subscribe((state, prevState) =>
  {
    if (suppressNextAutosave)
    {
      suppressNextAutosave = false
      return
    }

    if (PERSISTED_FIELDS.every((key) => state[key] === prevState[key]))
    {
      return
    }

    clearPendingAutosave()

    saveTimeout = setTimeout(() =>
    {
      saveTimeout = null
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

export const createBoardSession = async (): Promise<void> =>
{
  saveActiveBoardSnapshot()
  await saveAndActivateBoard(createBlankBoardData(), DEFAULT_TITLE)
}

export const createBoardSessionFromPreset = async (
  preset: TierPreset
): Promise<void> =>
{
  saveActiveBoardSnapshot()
  const data = createBoardDataFromPreset(preset)
  await saveAndActivateBoard(data, DEFAULT_TITLE)
}

export const switchBoardSession = async (boardId: BoardId): Promise<void> =>
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
  await loadBoardIntoSession(boardId)
  boardStore.setActiveBoardId(boardId)
}

export const deleteBoardSession = async (boardId: BoardId): Promise<void> =>
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
    await loadBoardIntoSession(nextActiveId)
    return
  }

  boardStore.removeBoardMeta(boardId)
}

export const duplicateBoardSession = async (
  boardId: BoardId
): Promise<void> =>
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

  await saveAndActivateBoard(source, source.title || DEFAULT_TITLE)
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

export const importBoardSession = async (
  data: BoardSnapshot
): Promise<void> =>
{
  saveActiveBoardSnapshot()
  await saveAndActivateBoard(data, data.title || DEFAULT_TITLE)
}

export const importBoardsSession = async (
  boards: BoardSnapshot[]
): Promise<void> =>
{
  if (boards.length === 0)
  {
    return
  }

  saveActiveBoardSnapshot()

  const boardStore = useWorkspaceBoardRegistryStore.getState()
  let nextBoards = boardStore.boards
  let lastId = boardStore.activeBoardId
  const plannedImports: Array<{
    id: BoardId
    normalized: BoardSnapshot
  }> = []

  for (const board of boards)
  {
    const id = generateBoardId()
    const title = deduplicateTitle(board.title || DEFAULT_TITLE, nextBoards)
    const normalized = normalizeBoardSnapshot(
      { ...board, title },
      getActivePaletteId(),
      title
    )

    plannedImports.push({ id, normalized })
    nextBoards = [...nextBoards, createBoardMeta(id, title)]
    lastId = id
  }

  await mapAsyncLimit(
    plannedImports,
    BOARD_IMPORT_CONCURRENCY,
    async (entry) =>
    {
      await prepareBoardForLoad(entry.id, entry.normalized, {
        warmCache: false,
      })
      return entry
    }
  )

  if (!lastId)
  {
    return
  }

  useWorkspaceBoardRegistryStore.getState().replaceRegistry(nextBoards, lastId)
  await loadBoardIntoSession(lastId)
}
