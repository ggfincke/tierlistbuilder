// src/features/library/lib/libraryBoardAria.ts
// accessible names for My Boards open actions

import type {
  LibraryBoardListItem,
  LibraryBoardVisibility,
} from '@tierlistbuilder/contracts/workspace/board'

import { PUBLISH_STATE_META } from '~/shared/board-ui/publishStateMeta'
import { formatCountedWord } from '~/shared/lib/pluralize'
import { LIBRARY_SYNC_META } from '~/features/library/lib/statusMeta'

const VISIBILITY_LABELS: Record<LibraryBoardVisibility, string> = {
  private: 'Private',
  public: 'Public',
}

export const getLibraryBoardAriaLabel = (board: LibraryBoardListItem): string =>
  [
    board.title,
    formatCountedWord(board.activeItemCount, 'item'),
    formatCountedWord(board.tierColors.length, 'tier'),
    VISIBILITY_LABELS[board.visibility],
    PUBLISH_STATE_META[board.publishState].label,
    LIBRARY_SYNC_META[board.syncState].label,
  ].join(', ')
