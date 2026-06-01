// convex/schema/seed.ts
// seed run visibility & upload tracking tables

import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { seedRunStatusValidator } from '../lib/validators/seedPipeline'

export const seedTables = {
  // durable visibility for Python seed attempts. reports stay local, but this
  // row lets server precheck/cleanup see the current release/run state
  seedRuns: defineTable({
    runId: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    status: seedRunStatusValidator,
    finishedAt: v.union(v.number(), v.null()),
    startedBy: v.string(),
    templateCount: v.number(),
    itemCount: v.number(),
    imageVariantCount: v.number(),
    error: v.union(v.string(), v.null()),
  })
    .index('byRunId', ['runId'])
    .index('byDatasetRelease', ['datasetKey', 'releaseId'])
    .index('byDatasetStatus', ['datasetKey', 'status']),
  seedRunStorageUploads: defineTable({
    runId: v.string(),
    datasetKey: v.string(),
    releaseId: v.string(),
    storageId: v.id('_storage'),
    status: v.union(
      v.literal('uploaded'),
      v.literal('resolved'),
      v.literal('cleaned')
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('byRun', ['datasetKey', 'releaseId', 'runId'])
    .index('byStorageId', ['storageId']),
}
