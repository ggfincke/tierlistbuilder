// src/features/workspace/boards/data/local/localBoardSession.ts
// board session service — bootstrap, autosave, storage I/O, & registry orchestration

import type {
  BoardMeta,
  BoardSnapshot,
} from '@tierlistbuilder/contracts/workspace/board'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  generateBoardId,
  type BoardId,
} from '@tierlistbuilder/contracts/lib/ids'
import type { PaletteId } from '@tierlistbuilder/contracts/lib/theme'
import { DEFAULT_TITLE } from '~/features/workspace/boards/lib/boardDefaults'
import {
  loadBoardFromStorage,
  loadBoardSyncStateOnly,
  removeBoardFromStorage,
  saveBoardToStorage,
  saveBoardSyncToStorage,
  type BoardLoadResult,
} from './boardStorage'
import { stampPendingBoardDelete } from './boardDeleteSyncMeta'
import { warmFromBoard } from '~/shared/images/imageBlobCache'
import { migrateBoardImages } from '~/shared/images/boardImageMigration'
import { mapAsyncLimit } from '~/shared/lib/asyncMapLimit'
import {
  STORAGE_NEAR_FULL_MESSAGE,
  isStorageNearFull,
} from '~/shared/lib/storageMetering'
import { toast } from '~/shared/notifications/useToastStore'
import { normalizeBoardSnapshot } from '~/features/workspace/boards/model/boardSnapshot'
import {
  BUILTIN_PRESETS,
  createBoardDataFromPreset,
} from '~/features/workspace/tier-presets/model/tierPresets'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import {
  boardDataFieldsEqual,
  extractBoardData,
  selectBoardDataFields,
} from '~/features/workspace/boards/model/boardSnapshot'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import {
  EMPTY_BOARD_SYNC_STATE,
  extractBoardSyncState,
  type BoardSyncState,
} from '~/features/workspace/boards/model/sync'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { scheduleIdle } from '~/shared/lib/scheduleIdle'
import { pluralizeVerb, pluralizeWord } from '~/shared/lib/pluralize'
import { makeProceedGuard } from '~/shared/lib/sync/proceedGuard'

let saveTimeout: ReturnType<typeof setTimeout> | null = null
let autosaveUnsubscribe: (() => void) | null = null
let suppressNextAutosave = false
// listener registered by useCloudSync once a board-delete handle mounts.
// deleteBoardSession calls it to trigger immediate cleanup; when no handle is
// mounted the sidecar alone preserves the intent for resumePendingSyncs
let boardDeletedListener: (() => void) | null = null
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

interface LoadedBoardState
{
  snapshot: BoardSnapshot
  syncState: BoardSyncState
}

const getActiveBoardSyncState = (): BoardSyncState =>
  extractBoardSyncState(useActiveBoardStore.getState())

// zustand subscribers run synchronously inside set(), so clear the autosave
// suppression flag immediately after loadBoard returns. this keeps the flag
// scoped to one dispatch, even when no selector-based autosave fires
const loadBoardState = (
  snapshot: BoardSnapshot,
  syncState: BoardSyncState = EMPTY_BOARD_SYNC_STATE
): void =>
{
  suppressNextAutosave = true
  try
  {
    useActiveBoardStore.getState().loadBoard(snapshot, syncState)
  }
  finally
  {
    suppressNextAutosave = false
  }
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
  saveBoardToStorage(boardId, data, {
    syncState: getActiveBoardSyncState(),
    onError: (message) =>
      useActiveBoardStore.getState().setRuntimeError(message),
  })

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

// normalize a BoardLoadResult into a loadable board state, surfacing a
// corrupted toast when the load failed; lets callers reuse a result they
// already have
const stateFromResult = (result: BoardLoadResult): LoadedBoardState =>
{
  if (result.status === 'corrupted')
  {
    toast('Board data was corrupted and has been reset.', 'error')
  }

  return {
    snapshot: normalizeBoardSnapshot(
      result.status === 'ok' ? result.data : null,
      getActivePaletteId()
    ),
    syncState: result.status === 'ok' ? result.sync : EMPTY_BOARD_SYNC_STATE,
  }
}

export const loadPersistedBoard = (boardId: BoardId): BoardSnapshot =>
  stateFromResult(loadBoardFromStorage(boardId)).snapshot

export const loadPersistedBoardState = (boardId: BoardId): LoadedBoardState =>
  stateFromResult(loadBoardFromStorage(boardId))

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
  boardId: BoardId,
  shouldProceed?: () => boolean
): Promise<BoardSnapshot> =>
{
  const canProceed = makeProceedGuard(shouldProceed)
  const state = loadPersistedBoardState(boardId)
  const prepared = await prepareBoardForLoad(boardId, state.snapshot)

  if (!canProceed())
  {
    return prepared
  }

  loadBoardState(prepared, state.syncState)
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
        `${pruned} ${pluralizeWord(pruned, 'board')} had corrupted data and ${pluralizeVerb(pruned, 'was', 'were')} removed.`,
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
      const state = stateFromResult(result)
      if (boardStore.activeBoardId !== requestedActiveId)
      {
        boardStore.setActiveBoardId(requestedActiveId)
      }
      const prepared = await prepareBoardForLoad(
        requestedActiveId,
        state.snapshot
      )
      loadBoardState(prepared, state.syncState)
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

export const persistBoardSyncState = (
  boardId: BoardId,
  syncState: BoardSyncState
): void =>
{
  if (
    !useWorkspaceBoardRegistryStore
      .getState()
      .boards.some((board) => board.id === boardId)
  )
  {
    return
  }

  const saveResult = saveBoardSyncToStorage(boardId, syncState)
  if (!saveResult.ok)
  {
    if (useWorkspaceBoardRegistryStore.getState().activeBoardId === boardId)
    {
      useActiveBoardStore.getState().setRuntimeError(saveResult.message)
    }
    return
  }

  if (useWorkspaceBoardRegistryStore.getState().activeBoardId === boardId)
  {
    useActiveBoardStore.getState().setSyncState(syncState)
  }
}

export const registerBoardAutosave = (): (() => void) =>
{
  if (autosaveUnsubscribe)
  {
    return autosaveUnsubscribe
  }

  const unsubscribe = useActiveBoardStore.subscribe(
    selectBoardDataFields,
    () =>
    {
      if (suppressNextAutosave)
      {
        suppressNextAutosave = false
        return
      }

      clearPendingAutosave()

      saveTimeout = setTimeout(() =>
      {
        saveTimeout = null
        saveActiveBoardSnapshot()
      }, 300)
    },
    { equalityFn: boardDataFieldsEqual }
  )

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
  boardStore.setActiveBoardId(boardId)
  await loadBoardIntoSession(boardId)
}

// register a listener for "board deleted locally". installed by useCloudSync on mount;
// cleared on sign-out so offline deletes fall back to sidecar-only / resumePendingSyncs
export const setBoardDeletedListener = (
  listener: (() => void) | null
): void =>
{
  boardDeletedListener = listener
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

  // capture the cloud externalId before removing storage — syncState is gone after.
  // read the sync sidecar directly so a corrupt envelope still surfaces the id
  // w/o paying a full board JSON parse just to read one field
  const cloudBoardExternalId =
    loadBoardSyncStateOnly(boardId).cloudBoardExternalId

  removeBoardFromStorage(boardId)
  const nextBoards = boardStore.boards.filter((board) => board.id !== boardId)

  if (cloudBoardExternalId)
  {
    stampPendingBoardDelete(cloudBoardExternalId)
    boardDeletedListener?.()
  }

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
  const nextBoards = boardStore.boards.slice()
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
    nextBoards.push(createBoardMeta(id, title))
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
