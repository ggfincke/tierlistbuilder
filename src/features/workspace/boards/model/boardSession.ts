// src/features/workspace/boards/model/boardSession.ts
// public board session facade for UI, export, bootstrap, & sync callers

import { registerBoardAutosaveController } from './session/boardSessionAutosave'
import { saveActiveBoardSnapshot } from './session/boardSessionPersistence'

export { bootstrapBoardSession } from './session/boardSessionBootstrap'
export {
  createBoardSession,
  createBoardSessionFromPreset,
  deleteBoardSession,
  duplicateBoardSession,
  importBoardSession,
  importBoardsSession,
  renameBoardSession,
  switchBoardSession,
} from './session/boardSessionCrud'
export {
  loadBoardIntoSession,
  loadPersistedBoard,
  loadPersistedBoardState,
  persistBoardStateForSync,
  persistBoardSyncState,
  persistBoardSyncStateToStorageOnly,
} from './session/boardSessionPersistence'
export {
  setBoardChangedListener,
  setBoardDeletedListener,
  setBoardLoadedListener,
} from './session/boardSessionEvents'

export const registerBoardAutosave = (): (() => void) =>
  registerBoardAutosaveController(saveActiveBoardSnapshot)
