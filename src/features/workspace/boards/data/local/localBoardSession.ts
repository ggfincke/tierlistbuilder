// src/features/workspace/boards/data/local/localBoardSession.ts
// board session service — bootstrap, autosave, storage I/O, & registry orchestration

import type {
  BoardMeta,
  BoardSnapshot,
} from '@/features/workspace/boards/model/contract'
import type { TierPreset } from '@/features/workspace/tier-presets/model/contract'
import type { BoardId, ItemId } from '@/shared/types/ids'
import type { PaletteId } from '@/shared/types/theme'
import { DEFAULT_TITLE } from '@/features/workspace/boards/lib/boardDefaults'
import { decodeImageAspectRatioFromSrc } from '@/features/workspace/settings/lib/imageFromUrl'
import { generateBoardId } from '@/shared/lib/id'
import {
  loadBoardFromStorage,
  removeBoardFromStorage,
  saveBoardToStorage,
  type BoardLoadResult,
} from './boardStorage'
import {
  STORAGE_NEAR_FULL_MESSAGE,
  isStorageNearFull,
} from '@/shared/lib/storageMetering'
import { toast } from '@/shared/notifications/useToastStore'
import {
  extractBoardData,
  normalizeBoardSnapshot,
} from '@/features/workspace/boards/model/boardSnapshot'
import {
  BUILTIN_PRESETS,
  createBoardDataFromPreset,
} from '@/features/workspace/tier-presets/model/tierPresets'
import { useWorkspaceBoardRegistryStore } from '@/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'

// covers every BoardSnapshot field — a compile-time check below ensures this
// list stays exhaustive, so future fields auto-persist
const PERSISTED_FIELDS = [
  'title',
  'tiers',
  'unrankedItemIds',
  'items',
  'deletedItems',
  'itemAspectRatio',
  'itemAspectRatioMode',
  'aspectRatioPromptDismissed',
  'defaultItemImageFit',
] as const satisfies readonly (keyof BoardSnapshot)[]

// exhaustiveness check — omitting a BoardSnapshot field above fails here
type _PersistedFieldsExhaustive =
  Exclude<keyof BoardSnapshot, (typeof PERSISTED_FIELDS)[number]> extends never
    ? true
    : false
const _persistedFieldsCheck: _PersistedFieldsExhaustive = true
void _persistedFieldsCheck

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
    toast(STORAGE_NEAR_FULL_MESSAGE, 'error')
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
  scheduleAspectRatioBackfill()
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
  scheduleAspectRatioBackfill()
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

// cap concurrent image decodes so legacy boards w/ hundreds of items don't
// spike memory by decoding every image at once
const BACKFILL_CONCURRENCY = 8

// drain a queue through N workers; swallows per-item errors (null ratios are
// silently skipped at dispatch time)
const runBackfillQueue = async (
  queue: [ItemId, string][],
  shouldCancel: () => boolean
): Promise<Record<ItemId, number>> =>
{
  const values: Record<ItemId, number> = {}
  const worker = async (): Promise<void> =>
  {
    while (queue.length > 0)
    {
      if (shouldCancel()) return
      const next = queue.shift()
      if (!next) return
      const [id, url] = next
      const ratio = await decodeImageAspectRatioFromSrc(url)
      if (ratio != null && ratio > 0) values[id] = ratio
    }
  }
  const workers = Array.from(
    { length: Math.min(BACKFILL_CONCURRENCY, queue.length) },
    () => worker()
  )
  await Promise.all(workers)
  return values
}

// fill in aspect ratios for legacy items imported before the field existed.
// runs at idle priority so board load stays snappy; captures the target
// board ID so decodes finishing after a board switch are ignored instead of
// poisoning the active board's items map
const scheduleAspectRatioBackfill = (): void =>
{
  const targetBoardId = useWorkspaceBoardRegistryStore.getState().activeBoardId
  scheduleIdle(() =>
  {
    const state = useActiveBoardStore.getState()
    const queue: [ItemId, string][] = []
    for (const item of Object.values(state.items))
    {
      if (item.imageUrl && item.aspectRatio === undefined)
      {
        queue.push([item.id, item.imageUrl])
      }
    }
    if (queue.length === 0) return

    const shouldCancel = () =>
      useWorkspaceBoardRegistryStore.getState().activeBoardId !== targetBoardId

    void runBackfillQueue(queue, shouldCancel).then((values) =>
    {
      if (shouldCancel()) return
      if (Object.keys(values).length > 0)
      {
        useActiveBoardStore.getState().backfillItemAspectRatios(values)
      }
    })
  })
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

export const bootstrapBoardSession = (): void =>
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
      useActiveBoardStore.getState().loadBoard(data)
      scheduleAspectRatioBackfill()
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
