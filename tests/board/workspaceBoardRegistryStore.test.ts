// tests/board/workspaceBoardRegistryStore.test.ts
// workspace board registry predicates

import { describe, expect, it } from 'vitest'

import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'

const BOARD_ID = 'board-registry-helper-test' as BoardId
const OTHER_BOARD_ID = 'board-registry-helper-other' as BoardId

describe('useWorkspaceBoardRegistryStore', () =>
{
  it('checks board membership through the shared registry predicate', () =>
  {
    useWorkspaceBoardRegistryStore.setState({
      boards: [
        {
          id: BOARD_ID,
          title: 'Registry helper test',
          createdAt: 1,
        },
      ],
      activeBoardId: BOARD_ID,
    })

    const registry = useWorkspaceBoardRegistryStore.getState()

    expect(registry.isBoardInRegistry(BOARD_ID)).toBe(true)
    expect(registry.isBoardInRegistry(OTHER_BOARD_ID)).toBe(false)
  })
})
