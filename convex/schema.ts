// convex/schema.ts
// * convex database schema assembler

import { authTables } from '@convex-dev/auth/server'
import { defineSchema } from 'convex/server'
import { marketplaceTables } from './schema/marketplace'
import { platformTables } from './schema/platform'
import { profileTables } from './schema/profile'
import { seedTables } from './schema/seed'
import { workspaceTables } from './schema/workspace'

export default defineSchema({
  // @convex-dev/auth tables - authAccounts, authSessions, authVerificationCodes,
  // authRefreshTokens, authRateLimits. do not rename or move; managed by the lib
  ...authTables,
  ...platformTables,
  ...profileTables,
  ...workspaceTables,
  ...marketplaceTables,
  ...seedTables,
})
