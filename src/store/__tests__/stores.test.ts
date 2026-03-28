// src/store/__tests__/stores.test.ts
// unit tests for board/title authority across the singleton Zustand stores

import type { StoreApi, UseBoundStore } from 'zustand'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BoardMeta, TierListData } from '../../types'

class MemoryStorage implements Storage
{
  private entries = new Map<string, string>()

  get length(): number
  {
    return this.entries.size
  }

  clear(): void
  {
    this.entries.clear()
  }

  getItem(key: string): string | null
  {
    return this.entries.get(key) ?? null
  }

  key(index: number): string | null
  {
    return Array.from(this.entries.keys())[index] ?? null
  }

  removeItem(key: string): void
  {
    this.entries.delete(key)
  }

  setItem(key: string, value: string): void
  {
    this.entries.set(key, value)
  }
}

type BoardManagerState = {
  boards: BoardMeta[]
  activeBoardId: string
  createBoard: () => void
  renameBoard: (boardId: string, title: string) => void
}

type TierListState = TierListData & {
  past: TierListData[]
  future: TierListData[]
  resetBoard: () => void
  addTextItem: (label: string, backgroundColor: string) => void
}

const loadStores = async () =>
{
  vi.resetModules()

  const [{ useBoardManagerStore }, { useTierListStore }, { boardStorageKey }] =
    await Promise.all([
      import('../useBoardManagerStore'),
      import('../useTierListStore'),
      import('../../utils/storage'),
    ])

  return {
    useBoardManagerStore: useBoardManagerStore as UseBoundStore<
      StoreApi<BoardManagerState>
    >,
    useTierListStore: useTierListStore as UseBoundStore<
      StoreApi<TierListState>
    >,
    boardStorageKey,
  }
}

const ensureActiveBoard = (
  store: UseBoundStore<StoreApi<BoardManagerState>>
): string =>
{
  const initial = store.getState()
  if (initial.activeBoardId && initial.boards.length > 0)
  {
    return initial.activeBoardId
  }

  initial.createBoard()
  return store.getState().activeBoardId
}

describe('singleton board stores', () =>
{
  beforeEach(() =>
  {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  afterEach(() =>
  {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('persists renamed board titles through the board manager save path', async () =>
  {
    const { useBoardManagerStore, useTierListStore, boardStorageKey } =
      await loadStores()
    const activeBoardId = ensureActiveBoard(useBoardManagerStore)

    useBoardManagerStore.getState().renameBoard(activeBoardId, 'Renamed Board')
    vi.advanceTimersByTime(301)

    expect(useTierListStore.getState().title).toBe('Renamed Board')
    expect(useBoardManagerStore.getState().boards[0].title).toBe(
      'Renamed Board'
    )
    expect(
      JSON.parse(localStorage.getItem(boardStorageKey(activeBoardId))!)
    ).toMatchObject({
      title: 'Renamed Board',
    })
  })

  it('preserves the current title when resetting the active board', async () =>
  {
    const { useBoardManagerStore, useTierListStore } = await loadStores()
    const activeBoardId = ensureActiveBoard(useBoardManagerStore)

    useBoardManagerStore.getState().renameBoard(activeBoardId, 'Custom Board')
    useTierListStore.getState().addTextItem('Alpha', '#123456')

    const itemId = useTierListStore.getState().unrankedItemIds[0]
    useTierListStore.setState((state) => ({
      ...state,
      tiers: state.tiers.map((tier, index) =>
        index === 0 ? { ...tier, itemIds: [itemId] } : tier
      ),
      unrankedItemIds: [],
    }))

    useTierListStore.getState().resetBoard()

    expect(useTierListStore.getState().title).toBe('Custom Board')
    expect(useTierListStore.getState().unrankedItemIds).toEqual([itemId])
    expect(
      useTierListStore
        .getState()
        .tiers.every((tier) => tier.itemIds.length === 0)
    ).toBe(true)
    expect(useTierListStore.getState().past).toEqual([])
    expect(useTierListStore.getState().future).toEqual([])
  })
})
