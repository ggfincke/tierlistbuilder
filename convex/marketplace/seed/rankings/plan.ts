// convex/marketplace/seed/rankings/plan.ts
// builds the manifest-derived ranking seed tasks, authors, lane summaries, &
// external IDs that the seed workflow consumes

import { clamp } from '@tierlistbuilder/contracts/lib/math'
import {
  curatedAuthorEmail,
  curatedSeedAuthorKey,
  formatRankingSeedId,
  sampleAuthorEmail,
  type SeedRankingKind,
} from './naming'
import type {
  SeedCuratedRanking,
  SeedRankingLane,
  SeedRankingLaneSummary,
  SeedRankingProfile,
  SeedRankingTarget,
  SeedRankingsManifest,
} from './validators'

export interface SeedAuthorRequest
{
  key: string
  email: string
  displayName: string
}

export type SeedRankingApplyTask =
  | {
      kind: 'sample'
      target: SeedRankingTarget
      lane: SeedRankingLane
      profile: SeedRankingProfile
      sequence: number
    }
  | {
      kind: 'curated'
      target: SeedRankingTarget
      curated: SeedCuratedRanking
      sequence: number
    }

export interface SeedRankingPlan
{
  tasks: SeedRankingApplyTask[]
  authors: SeedAuthorRequest[]
  laneSummaries: SeedRankingLaneSummary[]
  plannedSeedExternalIds: string[]
  sampleRankingsPlanned: number
  curatedRankingsPlanned: number
}

const normalizeProfileCount = (
  manifest: SeedRankingsManifest,
  target: SeedRankingTarget
): number =>
{
  const raw = target.sampleProfileCount ?? manifest.defaultProfileCount
  const count = Number.isFinite(raw) ? Math.floor(raw) : 0
  return clamp(count, 0, manifest.profiles.length)
}

const ensureLane = (
  byLane: Map<string, SeedRankingLaneSummary>,
  templateExternalId: string,
  criterionExternalId: string
): SeedRankingLaneSummary =>
{
  const key = `${templateExternalId}:${criterionExternalId}`
  const existing = byLane.get(key)
  if (existing) return existing
  const created = {
    templateExternalId,
    criterionExternalId,
    sampleRankings: 0,
    curatedRankings: 0,
  }
  byLane.set(key, created)
  return created
}

const recordAuthor = (
  byEmail: Map<string, SeedAuthorRequest>,
  key: string,
  email: string,
  displayName: string
): void =>
{
  byEmail.set(email, { key, email, displayName })
}

const recordPlannedSeed = (
  plannedSeedExternalIds: string[],
  templateExternalId: string,
  criterionExternalId: string,
  kind: SeedRankingKind,
  stableKey: string
): void =>
{
  plannedSeedExternalIds.push(
    formatRankingSeedId({
      templateExternalId,
      criterionExternalId,
      kind,
      stableKey,
    })
  )
}

export const buildSeedRankingPlan = (
  manifest: SeedRankingsManifest
): SeedRankingPlan =>
{
  const tasks: SeedRankingApplyTask[] = []
  const authorsByEmail = new Map<string, SeedAuthorRequest>()
  const lanes = new Map<string, SeedRankingLaneSummary>()
  const plannedSeedExternalIds: string[] = []
  let sequence = 0
  let sampleRankingsPlanned = 0
  let curatedRankingsPlanned = 0

  for (const profile of manifest.profiles)
  {
    recordAuthor(
      authorsByEmail,
      profile.key,
      sampleAuthorEmail(profile.key),
      profile.displayName
    )
  }

  for (const target of manifest.targets)
  {
    const profileCount = normalizeProfileCount(manifest, target)
    const profiles = manifest.profiles.slice(0, profileCount)
    for (const lane of target.lanes)
    {
      const summary = ensureLane(
        lanes,
        target.templateExternalId,
        lane.criterionExternalId
      )
      for (const profile of profiles)
      {
        sequence += 1
        tasks.push({ kind: 'sample', target, lane, profile, sequence })
        summary.sampleRankings += 1
        sampleRankingsPlanned += 1
        recordPlannedSeed(
          plannedSeedExternalIds,
          target.templateExternalId,
          lane.criterionExternalId,
          'sample',
          profile.key
        )
      }
    }
    for (const curated of target.curatedRankings ?? [])
    {
      sequence += 1
      tasks.push({ kind: 'curated', target, curated, sequence })
      ensureLane(
        lanes,
        target.templateExternalId,
        curated.criterionExternalId
      ).curatedRankings += 1
      curatedRankingsPlanned += 1
      recordPlannedSeed(
        plannedSeedExternalIds,
        target.templateExternalId,
        curated.criterionExternalId,
        'curated',
        curated.externalId
      )
      recordAuthor(
        authorsByEmail,
        curatedSeedAuthorKey(curated.authorKey),
        curatedAuthorEmail(curated.authorKey),
        curated.authorDisplayName
      )
    }
  }

  const laneSummaries = [...lanes.values()].sort(
    (a, b) =>
      a.templateExternalId.localeCompare(b.templateExternalId) ||
      a.criterionExternalId.localeCompare(b.criterionExternalId)
  )

  return {
    tasks,
    authors: [...authorsByEmail.values()],
    laneSummaries,
    plannedSeedExternalIds,
    sampleRankingsPlanned,
    curatedRankingsPlanned,
  }
}
