// src/features/workspace/boards/model/boardSession.ts
// public board session facade for UI, export, bootstrap, & sync callers

import { registerBoardAutosaveController } from '~/features/workspace/boards/model/session/boardSessionAutosave'
import { saveActiveBoardSnapshot } from '~/features/workspace/boards/model/session/boardSessionPersistence'

export { bootstrapBoardSession } from '~/features/workspace/boards/model/session/boardSessionBootstrap'
export {
  createBoardSession,
  createBoardSessionFromPreset,
  deleteBoardSession,
  duplicateBoardSession,
  importBoardSession,
  importBoardsSession,
  renameBoardSession,
  switchBoardSession,
} from '~/features/workspace/boards/model/session/boardSessionCrud'
export {
  loadBoardIntoSession,
  loadPersistedBoard,
  loadPersistedBoardState,
  persistBoardStateForSync,
  persistBoardSyncState,
  persistBoardSyncStateToStorageOnly,
} from '~/features/workspace/boards/model/session/boardSessionPersistence'
export {
  setBoardChangedListener,
  setBoardDeletedListener,
  setBoardLoadedListener,
} from '~/features/workspace/boards/model/session/boardSessionEvents'

export const registerBoardAutosave = (): (() => void) =>
  registerBoardAutosaveController(saveActiveBoardSnapshot)
