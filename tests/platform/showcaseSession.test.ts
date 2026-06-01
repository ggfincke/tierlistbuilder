// tests/platform/showcaseSession.test.ts
// showcase editor session store borrowing

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import {
  createInitialBoardData,
  extractBoardData,
} from '~/shared/board-data/boardSnapshot'
import {
  DEFAULT_APP_PREFERENCES,
  usePreferencesStore,
} from '~/features/platform/preferences/model/usePreferencesStore'
import {
  enterShowcaseEditing,
  exitShowcaseEditing,
} from '~/features/social/showcase/model/showcaseSession'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { resetBoardStores } from '@tests/shared-lib/boardStores'

const TEST_BOARD_ID = 'board-showcase-session-test' as BoardId

const resetStores = (): void =>
{
  resetBoardStores({
    registry: {
      boards: [{ id: TEST_BOARD_ID, title: 'Real board', createdAt: 1 }],
      activeBoardId: TEST_BOARD_ID,
    },
    snapshot: {
      ...createInitialBoardData('classic'),
      title: 'Real board',
    },
  })
  usePreferencesStore.setState(DEFAULT_APP_PREFERENCES)
}

describe('showcaseSession', () =>
{
  beforeEach(() =>
  {
    resetStores()
  })

  afterEach(() =>
  {
    exitShowcaseEditing()
    resetStores()
  })

  it('does not persist item-size changes while borrowing the board store', () =>
  {
    usePreferencesStore.setState({ itemSize: 'small' })
    const showcase = {
      ...createInitialBoardData('classic'),
      title: 'Showcase board',
    }

    enterShowcaseEditing(showcase)

    expect(usePreferencesStore.getState().itemSize).toBe('small')
    expect(extractBoardData(useActiveBoardStore.getState()).title).toBe(
      'Showcase board'
    )

    exitShowcaseEditing()

    expect(usePreferencesStore.getState().itemSize).toBe('small')
    expect(extractBoardData(useActiveBoardStore.getState()).title).toBe(
      'Real board'
    )
  })
})
