// tests/store/tierRowColor.test.ts
// per-tier row background — store actions, normalization, & preset round-trip

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { normalizeBoardSnapshot } from '~/features/workspace/boards/model/boardSnapshot'
import {
  createBoardDataFromPreset,
  extractPresetFromBoard,
} from '~/features/workspace/tier-presets/model/tierPresets'
import {
  areTierColorSpecsEqual,
  createCustomTierColorSpec,
  createPaletteTierColorSpec,
} from '~/shared/theme/tierColors'
import type { BoardSnapshot } from '@tierlistbuilder/contracts/workspace/board'
import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import { makeBoardSnapshot, makeTier } from '../fixtures'

const resetStore = () =>
{
  useActiveBoardStore.setState({
    title: 'Test',
    tiers: [
      makeTier({ id: 'tier-1', name: 'S' }),
      makeTier({
        id: 'tier-2',
        name: 'A',
        colorSpec: createPaletteTierColorSpec(1),
      }),
    ],
    unrankedItemIds: [],
    items: {},
    deletedItems: [],
    past: [],
    future: [],
    activeItemId: null,
    dragPreview: null,
    dragGroupIds: [],
    keyboardMode: 'idle',
    keyboardFocusItemId: null,
    selection: { ids: [], set: new Set() },
    lastClickedItemId: null,
    itemsManuallyMoved: false,
    runtimeError: null,
  })
}

describe('recolorTierRow', () =>
{
  beforeEach(resetStore)
  afterEach(resetStore)

  it('sets a palette row color on the target tier', () =>
  {
    useActiveBoardStore
      .getState()
      .recolorTierRow('tier-1', createPaletteTierColorSpec(3))

    const tier = useActiveBoardStore
      .getState()
      .tiers.find((entry) => entry.id === 'tier-1')
    expect(tier?.rowColorSpec).toEqual({ kind: 'palette', index: 3 })
  })

  it('sets a custom hex row color', () =>
  {
    useActiveBoardStore
      .getState()
      .recolorTierRow('tier-1', createCustomTierColorSpec('#abcdef'))

    const tier = useActiveBoardStore
      .getState()
      .tiers.find((entry) => entry.id === 'tier-1')
    expect(tier?.rowColorSpec).toEqual({ kind: 'custom', hex: '#abcdef' })
  })

  it('clears the row color when passed null', () =>
  {
    const store = useActiveBoardStore.getState()
    store.recolorTierRow('tier-1', createPaletteTierColorSpec(2))
    store.recolorTierRow('tier-1', null)

    const tier = useActiveBoardStore
      .getState()
      .tiers.find((entry) => entry.id === 'tier-1')
    expect(tier?.rowColorSpec).toBeUndefined()
  })

  it('only affects the target tier', () =>
  {
    useActiveBoardStore
      .getState()
      .recolorTierRow('tier-1', createPaletteTierColorSpec(5))

    const tiers = useActiveBoardStore.getState().tiers
    expect(tiers.find((entry) => entry.id === 'tier-1')?.rowColorSpec).toEqual({
      kind: 'palette',
      index: 5,
    })
    expect(
      tiers.find((entry) => entry.id === 'tier-2')?.rowColorSpec
    ).toBeUndefined()
  })

  it('is undoable & labeled', () =>
  {
    const store = useActiveBoardStore.getState()
    store.recolorTierRow('tier-1', createPaletteTierColorSpec(4))

    const past = useActiveBoardStore.getState().past
    expect(past[past.length - 1]?.label).toBe('Recolor row')

    const result = useActiveBoardStore.getState().undo()
    expect(result).toEqual({ label: 'Recolor row' })
    expect(
      useActiveBoardStore
        .getState()
        .tiers.find((entry) => entry.id === 'tier-1')?.rowColorSpec
    ).toBeUndefined()
  })

  it('bails out as no-op when clearing an already-clear row color', () =>
  {
    const store = useActiveBoardStore.getState()
    store.recolorTierRow('tier-1', null)
    expect(useActiveBoardStore.getState().past.length).toBe(0)
  })

  it('does not create undo history when reapplying the same row palette color', () =>
  {
    const store = useActiveBoardStore.getState()
    store.recolorTierRow('tier-1', createPaletteTierColorSpec(3))
    store.recolorTierRow('tier-1', createPaletteTierColorSpec(3))

    const state = useActiveBoardStore.getState()
    expect(state.past.map((entry) => entry.label)).toEqual(['Recolor row'])
    expect(state.past).toHaveLength(1)
  })
})

describe('recolorTier', () =>
{
  beforeEach(resetStore)
  afterEach(resetStore)

  it('does not create undo history when reapplying the same label color', () =>
  {
    const store = useActiveBoardStore.getState()
    store.recolorTier('tier-1', createCustomTierColorSpec('#abcdef'))
    store.recolorTier('tier-1', createCustomTierColorSpec('#abcdef'))

    const state = useActiveBoardStore.getState()
    expect(state.past.map((entry) => entry.label)).toEqual(['Recolor tier'])
    expect(state.past).toHaveLength(1)
  })
})

describe('normalizeBoardSnapshot row color', () =>
{
  it('preserves rowColorSpec when present', () =>
  {
    const raw = makeBoardSnapshot({
      title: 'x',
      tiers: [
        makeTier({
          id: 'tier-s',
          name: 'S',
          rowColorSpec: createCustomTierColorSpec('#112233'),
        }),
      ],
    })

    const normalized = normalizeBoardSnapshot(raw, 'classic')
    expect(normalized.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#112233',
    })
  })

  it('omits rowColorSpec when absent', () =>
  {
    const raw = makeBoardSnapshot({
      title: 'x',
      tiers: [makeTier({ id: 'tier-s', name: 'S' })],
    })

    const normalized = normalizeBoardSnapshot(raw, 'classic')
    expect(normalized.tiers[0].rowColorSpec).toBeUndefined()
  })

  it('drops invalid rowColorSpec input', () =>
  {
    const raw: Partial<BoardSnapshot> & { tiers: unknown[] } = {
      title: 'x',
      tiers: [
        {
          id: 'tier-s',
          name: 'S',
          colorSpec: createPaletteTierColorSpec(0),
          rowColorSpec: 'not a spec',
          itemIds: [],
        },
      ],
      unrankedItemIds: [],
      items: {},
      deletedItems: [],
    }

    const normalized = normalizeBoardSnapshot(
      raw as Partial<BoardSnapshot>,
      'classic'
    )
    expect(normalized.tiers[0].rowColorSpec).toBeUndefined()
  })
})

describe('preset row color round-trip', () =>
{
  it('carries rowColorSpec from extracted preset back to board', () =>
  {
    const board: BoardSnapshot = makeBoardSnapshot({
      title: 'x',
      tiers: [
        makeTier({
          id: 'tier-1',
          name: 'S',
          rowColorSpec: createCustomTierColorSpec('#445566'),
        }),
      ],
    })

    const preset: TierPreset = extractPresetFromBoard(board, 'My Preset')
    expect(preset.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#445566',
    })

    const applied = createBoardDataFromPreset(preset)
    expect(applied.tiers[0].rowColorSpec).toEqual({
      kind: 'custom',
      hex: '#445566',
    })
  })

  it('omits rowColorSpec when absent from the source tier', () =>
  {
    const board: BoardSnapshot = makeBoardSnapshot({
      title: 'x',
      tiers: [makeTier({ id: 'tier-1', name: 'S' })],
    })

    const preset = extractPresetFromBoard(board, 'My Preset')
    expect(preset.tiers[0].rowColorSpec).toBeUndefined()

    const applied = createBoardDataFromPreset(preset)
    expect(applied.tiers[0].rowColorSpec).toBeUndefined()
  })
})

describe('areTierColorSpecsEqual', () =>
{
  it('compares palette & custom specs by value', () =>
  {
    expect(
      areTierColorSpecsEqual(
        createPaletteTierColorSpec(2),
        createPaletteTierColorSpec(2)
      )
    ).toBe(true)
    expect(
      areTierColorSpecsEqual(
        createCustomTierColorSpec('#ABCDEF'),
        createCustomTierColorSpec('#abcdef')
      )
    ).toBe(true)
    expect(
      areTierColorSpecsEqual(
        createPaletteTierColorSpec(2),
        createPaletteTierColorSpec(3)
      )
    ).toBe(false)
  })
})
