// convex/users.ts
// account API compatibility exports

export {
  getMe,
  updatePrivacySettings,
  updateProfile,
} from './platform/account/profile'
export {
  listSessions,
  revokeSession,
  signOutEverywhere,
} from './platform/account/sessions'
export {
  commitAvatar,
  removeAvatar,
  setAvatar,
} from './platform/account/avatar'
export { changePassword, getPasswordAccount } from './platform/account/password'
export {
  cascadeDeleteUserData,
  cleanupAuthSessions,
  cleanupRevokedSessionTokens,
  deleteAccount,
} from './platform/account/cascadeDelete'
