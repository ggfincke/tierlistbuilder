// src/features/workspace/boards/model/boardSession.ts
// public board session facade for UI, export, & bootstrap callers

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
  saveActiveBoardSnapshot,
  saveBoardSnapshot,
} from './session/boardSessionPersistence'
export { setBoardLoadedListener } from './session/boardSessionEvents'

export const registerBoardAutosave = (): (() => void) =>
  registerBoardAutosaveController(saveActiveBoardSnapshot)
